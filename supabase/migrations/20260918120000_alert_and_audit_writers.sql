begin;

-- The schema deliberately keeps clients out of public.alerts and public.deletion_audit:
-- authenticated holds update on alerts.read_at only, and insert on deletion_audit is
-- revoked outright. Nothing writes either table, while the Firebase app raises alerts
-- and records a deletion log on every soft delete, so both flows would stop at cutover.
--
-- These functions are the writers. They keep the tables closed to direct writes while
-- stamping the actor from the session rather than trusting the caller.

create or replace function public.record_alert(
  p_organization_id uuid,
  p_alert_type text,
  p_severity text,
  p_title text,
  p_message text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_action_url text default null,
  p_action_required boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alert_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if coalesce(p_severity, '') not in ('info', 'warning', 'critical') then
    raise exception 'Severity must be info, warning or critical.' using errcode = '22023';
  end if;
  if coalesce(btrim(p_alert_type), '') = '' or coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_message), '') = '' then
    raise exception 'An alert needs a type, a title and a message.' using errcode = '22023';
  end if;
  if not app_private.is_org_member(p_organization_id) then
    raise exception 'You are not a member of that farm.' using errcode = '42501';
  end if;
  if not app_private.subscription_is_active(p_organization_id) then
    raise exception 'An active subscription is required.' using errcode = '42501';
  end if;

  -- An unread alert about the same thing is left alone, so a repeated check cannot
  -- bury the panel in duplicates.
  select existing.id into v_alert_id
  from public.alerts existing
  where existing.organization_id = p_organization_id
    and existing.alert_type = btrim(p_alert_type)
    and existing.read_at is null
    and existing.entity_id is not distinct from p_entity_id
    and existing.entity_type is not distinct from nullif(btrim(coalesce(p_entity_type, '')), '')
  limit 1;
  if found then
    return v_alert_id;
  end if;

  insert into public.alerts (
    organization_id, alert_type, severity, title, message,
    entity_type, entity_id, action_url, action_required
  ) values (
    p_organization_id, btrim(p_alert_type), p_severity, btrim(p_title), btrim(p_message),
    nullif(btrim(coalesce(p_entity_type, '')), ''), p_entity_id,
    nullif(btrim(coalesce(p_action_url, '')), ''), coalesce(p_action_required, false)
  )
  returning id into v_alert_id;

  return v_alert_id;
end;
$$;

create or replace function public.record_deletion_audit(
  p_organization_id uuid,
  p_entity_type text,
  p_action text,
  p_entity_id uuid default null,
  p_legacy_entity_id text default null,
  p_reason text default null,
  p_snapshot jsonb default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_audit_id bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if coalesce(p_action, '') not in ('archive', 'restore', 'permanent_delete', 'void', 'correction') then
    raise exception 'Unsupported deletion action.' using errcode = '22023';
  end if;
  if coalesce(btrim(p_entity_type), '') = '' then
    raise exception 'An entity type is required.' using errcode = '22023';
  end if;
  if p_entity_id is null and coalesce(btrim(coalesce(p_legacy_entity_id, '')), '') = '' then
    raise exception 'An entity id is required.' using errcode = '22023';
  end if;
  if not app_private.is_org_member(p_organization_id) then
    raise exception 'You are not a member of that farm.' using errcode = '42501';
  end if;
  if not app_private.subscription_is_active(p_organization_id) then
    raise exception 'An active subscription is required.' using errcode = '42501';
  end if;

  insert into public.deletion_audit (
    organization_id, entity_type, entity_id, legacy_entity_id, action, reason, performed_by, snapshot
  ) values (
    p_organization_id, btrim(p_entity_type), p_entity_id,
    nullif(btrim(coalesce(p_legacy_entity_id, '')), ''), p_action,
    nullif(btrim(coalesce(p_reason, '')), ''), (select auth.uid()), p_snapshot
  )
  returning id into v_audit_id;

  return v_audit_id;
end;
$$;

revoke all on function public.record_alert(uuid, text, text, text, text, text, uuid, text, boolean) from public, anon;
revoke all on function public.record_deletion_audit(uuid, text, text, uuid, text, text, jsonb) from public, anon;

grant execute on function public.record_alert(uuid, text, text, text, text, text, uuid, text, boolean) to authenticated;
grant execute on function public.record_deletion_audit(uuid, text, text, uuid, text, text, jsonb) to authenticated;

commit;
