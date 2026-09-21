begin;

alter table public.stock_requests add column idempotency_key text;
create unique index stock_requests_idempotency_idx
  on public.stock_requests (organization_id, idempotency_key)
  where idempotency_key is not null;

alter table public.usage_logs add column idempotency_key text;
create unique index usage_logs_idempotency_idx
  on public.usage_logs (organization_id, idempotency_key)
  where idempotency_key is not null;

alter table public.stock_issues add column idempotency_key text;
create unique index stock_issues_idempotency_idx
  on public.stock_issues (organization_id, idempotency_key)
  where idempotency_key is not null;

alter table public.packing_records add column idempotency_key text;
create unique index packing_records_idempotency_idx
  on public.packing_records (organization_id, idempotency_key)
  where idempotency_key is not null;

alter table public.shipments add column idempotency_key text;
create unique index shipments_idempotency_idx
  on public.shipments (organization_id, idempotency_key)
  where idempotency_key is not null;

alter table public.stock_issues
  add constraint stock_issues_return_schedule_check check (
    (mode = 'returnable' and expected_return_at is not null)
    or (mode = 'consumable' and expected_return_at is null)
  );

alter table public.stock_issue_returns
  add constraint stock_issue_returns_movement_check check (
    (condition = 'good' and inventory_movement_id is not null)
    or (condition in ('damaged', 'lost') and inventory_movement_id is null)
  );

create or replace function app_private.feature_is_enabled(
  target_organization_id uuid,
  target_feature_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.is_platform_admin() or (
    app_private.subscription_is_active(target_organization_id)
    and exists (
      select 1
      from public.organization_subscriptions subscription
      join public.plan_entitlements entitlement
        on entitlement.plan_id = subscription.plan_id
       and entitlement.feature_key = target_feature_key
      where subscription.organization_id = target_organization_id
        and entitlement.enabled
    )
  )
$$;

create or replace function app_private.lock_feature_quota(
  target_organization_id uuid,
  target_feature_key text
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_organization_id::text || ':' || target_feature_key, 0)
  )
$$;

create or replace function app_private.enforce_membership_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_limit numeric;
  active_members bigint;
begin
  if not new.active or (tg_op = 'UPDATE' and old.active) then
    return new;
  end if;

  perform app_private.lock_feature_quota(new.organization_id, 'team_members');
  member_limit := app_private.entitlement_limit(new.organization_id, 'team_members');

  if member_limit is not null then
    select count(*) into active_members
    from public.organization_memberships membership
    where membership.organization_id = new.organization_id
      and membership.active
      and membership.user_id <> new.user_id;

    if active_members >= member_limit then
      raise exception 'The team member limit for this plan has been reached.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger enforce_membership_limit_before_write
  before insert or update of active on public.organization_memberships
  for each row execute function app_private.enforce_membership_limit();

create or replace function app_private.enforce_inventory_item_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_limit numeric;
  active_items bigint;
begin
  if not new.active or (tg_op = 'UPDATE' and old.active) then
    return new;
  end if;

  perform app_private.lock_feature_quota(new.organization_id, 'inventory_items');
  item_limit := app_private.entitlement_limit(new.organization_id, 'inventory_items');

  if item_limit is not null then
    select count(*) into active_items
    from public.inventory_items item
    where item.organization_id = new.organization_id
      and item.active
      and item.id <> new.id;

    if active_items >= item_limit then
      raise exception 'The inventory item limit for this plan has been reached.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger enforce_inventory_item_limit_before_write
  before insert or update of active on public.inventory_items
  for each row execute function app_private.enforce_inventory_item_limit();

create or replace function app_private.to_stock_quantity(
  target_organization_id uuid,
  target_item_id uuid,
  source_unit_id uuid,
  source_quantity numeric
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  stock_unit_id uuid;
  item_factor numeric;
  source_unit public.units_of_measure%rowtype;
  stock_unit public.units_of_measure%rowtype;
begin
  if source_quantity is null or source_quantity <= 0 then
    raise exception 'Quantity must be greater than zero.' using errcode = '22023';
  end if;

  select item.stock_unit_id into stock_unit_id
  from public.inventory_items item
  where item.id = target_item_id
    and item.organization_id = target_organization_id
    and item.active;

  if stock_unit_id is null then
    raise exception 'Inventory item not found or inactive.' using errcode = 'P0002';
  end if;
  if stock_unit_id = source_unit_id then
    return source_quantity;
  end if;

  select conversion.quantity_in_stock_unit into item_factor
  from public.inventory_item_units conversion
  where conversion.item_id = target_item_id
    and conversion.organization_id = target_organization_id
    and conversion.unit_id = source_unit_id
    and conversion.active;

  if item_factor is not null then
    return source_quantity * item_factor;
  end if;

  select * into source_unit
  from public.units_of_measure
  where id = source_unit_id
    and active
    and (organization_id is null or organization_id = target_organization_id);
  select * into stock_unit
  from public.units_of_measure
  where id = stock_unit_id
    and active
    and (organization_id is null or organization_id = target_organization_id);

  if source_unit.id is null or stock_unit.id is null
    or source_unit.dimension <> stock_unit.dimension
    or source_unit.base_code <> stock_unit.base_code then
    raise exception 'The selected unit cannot be converted to this item''s stock unit.' using errcode = '22023';
  end if;

  return source_quantity * source_unit.factor_to_base / stock_unit.factor_to_base;
end;
$$;

create or replace function app_private.next_document_number(
  target_organization_id uuid,
  target_document_type text,
  default_prefix text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  allocated_value bigint;
  allocated_prefix text;
begin
  insert into public.document_sequences (organization_id, document_type, prefix, next_value)
  values (target_organization_id, target_document_type, default_prefix, 2)
  on conflict (organization_id, document_type) do update
    set next_value = public.document_sequences.next_value + 1,
        updated_at = now()
  returning next_value - 1, prefix into allocated_value, allocated_prefix;

  return allocated_prefix || '-' || lpad(allocated_value::text, 6, '0');
end;
$$;

revoke all on function app_private.feature_is_enabled(uuid, text) from public, anon, authenticated;
revoke all on function app_private.lock_feature_quota(uuid, text) from public, anon, authenticated;
revoke all on function app_private.to_stock_quantity(uuid, uuid, uuid, numeric) from public, anon, authenticated;
revoke all on function app_private.next_document_number(uuid, text, text) from public, anon, authenticated;

alter table public.farm_locations
  add constraint farm_locations_id_organization_unique unique (id, organization_id);
alter table public.farm_zones
  add constraint farm_zones_id_organization_unique unique (id, organization_id);

alter table public.farm_zones
  add constraint farm_zones_location_tenant_fk
  foreign key (location_id, organization_id)
  references public.farm_locations(id, organization_id) on delete restrict;
alter table public.farm_zones
  add constraint farm_zones_parent_tenant_fk
  foreign key (parent_zone_id, organization_id)
  references public.farm_zones(id, organization_id) on delete restrict;
alter table public.inventory_movements
  add constraint inventory_movements_zone_tenant_fk foreign key (farm_zone_id, organization_id)
  references public.farm_zones(id, organization_id) on delete restrict;
alter table public.stock_requests
  add constraint stock_requests_zone_tenant_fk foreign key (farm_zone_id, organization_id)
  references public.farm_zones(id, organization_id) on delete restrict;
alter table public.usage_logs
  add constraint usage_logs_zone_tenant_fk foreign key (farm_zone_id, organization_id)
  references public.farm_zones(id, organization_id) on delete restrict;
alter table public.equipment_checkouts
  add constraint equipment_checkouts_zone_tenant_fk foreign key (farm_zone_id, organization_id)
  references public.farm_zones(id, organization_id) on delete restrict;
alter table public.spray_plans
  add constraint spray_plans_zone_tenant_fk foreign key (farm_zone_id, organization_id)
  references public.farm_zones(id, organization_id) on delete restrict;
alter table public.packing_fulfilment_plans
  add constraint packing_plans_zone_tenant_fk foreign key (farm_zone_id, organization_id)
  references public.farm_zones(id, organization_id) on delete restrict;
alter table public.packing_records
  add constraint packing_records_zone_tenant_fk foreign key (farm_zone_id, organization_id)
  references public.farm_zones(id, organization_id) on delete restrict;
alter table public.crop_plans
  add constraint crop_plans_zone_tenant_fk foreign key (farm_zone_id, organization_id)
  references public.farm_zones(id, organization_id) on delete restrict;
alter table public.livestock_pens
  add constraint livestock_pens_zone_tenant_fk foreign key (farm_zone_id, organization_id)
  references public.farm_zones(id, organization_id) on delete restrict;
alter table public.water_records
  add constraint water_records_zone_tenant_fk foreign key (farm_zone_id, organization_id)
  references public.farm_zones(id, organization_id) on delete restrict;
alter table public.sigatoka_plots
  add constraint sigatoka_plots_zone_tenant_fk foreign key (farm_zone_id, organization_id)
  references public.farm_zones(id, organization_id) on delete restrict;

create or replace function app_private.validate_unit_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_unit_id uuid;
begin
  candidate_unit_id := nullif(to_jsonb(new) ->> tg_argv[0], '')::uuid;
  if candidate_unit_id is not null and not exists (
    select 1 from public.units_of_measure unit
    where unit.id = candidate_unit_id
      and unit.active
      and (unit.organization_id is null or unit.organization_id = new.organization_id)
  ) then
    raise exception 'The selected unit is not available to this organization.' using errcode = '23503';
  end if;
  return new;
end;
$$;

do $$
declare
  target record;
begin
  for target in select * from (values
    ('inventory_items', 'stock_unit_id'),
    ('inventory_item_units', 'unit_id'),
    ('inventory_movements', 'original_unit_id'),
    ('stock_request_items', 'requested_unit_id'),
    ('stock_issues', 'stock_unit_id'),
    ('usage_logs', 'unit_id'),
    ('spray_plan_items', 'requested_unit_id'),
    ('sale_items', 'unit_id')
  ) as unit_columns(table_name, column_name)
  loop
    execute format(
      'create trigger %I before insert or update of %I, organization_id on public.%I for each row execute function app_private.validate_unit_scope(%L)',
      'validate_' || target.table_name || '_' || target.column_name,
      target.column_name,
      target.table_name,
      target.column_name
    );
  end loop;
end;
$$;

create or replace function app_private.validate_quality_standard_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.quality_standard_id is not null and not exists (
    select 1 from public.packing_quality_standards standard
    where standard.id = new.quality_standard_id
      and standard.active
      and (standard.organization_id is null or standard.organization_id = new.organization_id)
  ) then
    raise exception 'The quality standard is not available to this organization.' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger validate_packing_record_quality_standard
  before insert or update of quality_standard_id, organization_id on public.packing_records
  for each row execute function app_private.validate_quality_standard_scope();

create or replace function app_private.snapshot_packing_quality_standard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.quality_standard_id is null then
    new.quality_standard_snapshot := '{}'::jsonb;
  elsif tg_op = 'INSERT' or new.quality_standard_id is distinct from old.quality_standard_id then
    select to_jsonb(standard) || jsonb_build_object(
      'grades', coalesce((
        select jsonb_agg(to_jsonb(grade) order by grade.sort_order, grade.name)
        from public.packing_quality_grades grade
        where grade.standard_id = standard.id
      ), '[]'::jsonb)
    ) into new.quality_standard_snapshot
    from public.packing_quality_standards standard
    where standard.id = new.quality_standard_id
      and standard.active
      and (standard.organization_id is null or standard.organization_id = new.organization_id);

    if new.quality_standard_snapshot is null then
      raise exception 'The quality standard is unavailable.' using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;

create trigger snapshot_packing_quality_standard_before_write
  before insert or update of quality_standard_id, organization_id on public.packing_records
  for each row execute function app_private.snapshot_packing_quality_standard();

create or replace function app_private.can_approve_requests(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.is_platform_admin() or exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.user_id = (select auth.uid())
      and membership.active
      and membership.role in ('owner', 'manager')
      and (
        membership.role = 'owner'
        or 'agricRequests'::public.app_permission = any(membership.permissions)
      )
  )
$$;

create or replace function app_private.farm_week_for_date(
  target_organization_id uuid,
  target_date date
)
returns table (week_number smallint, week_year integer, week_start date, week_end date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  starts_on integer := 0;
  year_start date;
  year_end date;
  first_week_end date;
  calculated_week integer;
  calculated_start date;
  calculated_end date;
begin
  select profile.week_starts_on into starts_on
  from public.farm_profiles profile
  where profile.organization_id = target_organization_id;
  starts_on := coalesce(starts_on, 0);
  year_start := make_date(extract(year from target_date)::integer, 1, 1);
  year_end := make_date(extract(year from target_date)::integer, 12, 31);
  first_week_end := year_start + ((starts_on + 6 - extract(dow from year_start)::integer + 7) % 7);

  if target_date <= first_week_end then
    calculated_week := 1;
    calculated_start := year_start;
    calculated_end := first_week_end;
  else
    calculated_week := least(52, 2 + ((target_date - first_week_end - 1) / 7));
    calculated_start := first_week_end + 1 + ((calculated_week - 2) * 7);
    calculated_end := calculated_start + 6;
  end if;

  if calculated_week = 52 or calculated_end > year_end then
    calculated_end := year_end;
  end if;

  return query select calculated_week::smallint, extract(year from target_date)::integer, calculated_start, calculated_end;
end;
$$;

revoke all on function app_private.validate_unit_scope() from public, anon, authenticated;
revoke all on function app_private.validate_quality_standard_scope() from public, anon, authenticated;
revoke all on function app_private.can_approve_requests(uuid) from public, anon, authenticated;
revoke all on function app_private.farm_week_for_date(uuid, date) from public, anon, authenticated;

create or replace function public.create_stock_request(
  p_organization_id uuid,
  p_items jsonb,
  p_farm_zone_id uuid default null,
  p_required_by_date date default null,
  p_priority text default 'normal',
  p_notes text default null,
  p_action text default 'submit',
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_name text;
  request_id uuid;
  request_number text;
  request_status public.request_status;
  zone_name text;
  item_payload jsonb;
  item_id uuid;
  unit_id uuid;
  requested_quantity numeric;
  stock_quantity numeric;
  item_mode public.request_item_mode;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  if not app_private.subscription_is_active(p_organization_id) then
    raise exception 'The organization subscription is not active.' using errcode = '42501';
  end if;
  if not app_private.has_any_permission(p_organization_id, array['agricRequests']::public.app_permission[]) then
    raise exception 'You do not have permission to create stock requests.' using errcode = '42501';
  end if;
  if p_priority not in ('normal', 'urgent') then
    raise exception 'Priority must be normal or urgent.' using errcode = '22023';
  end if;
  if p_action not in ('draft', 'submit', 'submit_and_approve') then
    raise exception 'Action must be draft, submit, or submit_and_approve.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one request item is required.' using errcode = '22023';
  end if;
  if p_action = 'submit_and_approve' and not app_private.can_approve_requests(p_organization_id) then
    raise exception 'Only an owner or authorized manager can submit and approve a request.' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    perform app_private.lock_feature_quota(p_organization_id, 'stock-request:' || p_idempotency_key);
    select existing.id into request_id
    from public.stock_requests existing
    where existing.organization_id = p_organization_id
      and existing.idempotency_key = p_idempotency_key;
    if request_id is not null then
      return request_id;
    end if;
  end if;

  select profile.display_name into actor_name from public.profiles profile where profile.id = actor_id;
  actor_name := coalesce(nullif(btrim(actor_name), ''), app_private.current_email()::text, 'Team member');

  if p_farm_zone_id is not null then
    select zone.name into zone_name
    from public.farm_zones zone
    where zone.id = p_farm_zone_id and zone.organization_id = p_organization_id and zone.active;
    if zone_name is null then
      raise exception 'The selected farm zone is not available.' using errcode = '23503';
    end if;
  end if;

  request_number := app_private.next_document_number(p_organization_id, 'stock_request', 'REQ');
  request_status := case p_action
    when 'draft' then 'draft'::public.request_status
    when 'submit' then 'pending'::public.request_status
    else 'approved'::public.request_status
  end;

  insert into public.stock_requests (
    organization_id, request_number, requested_by, requested_by_name,
    farm_zone_id, farm_zone_name, requested_at, required_by_date,
    status, priority, notes, approved_by, approved_at, idempotency_key
  ) values (
    p_organization_id, request_number, actor_id, actor_name,
    p_farm_zone_id, zone_name, now(), p_required_by_date,
    request_status, p_priority, nullif(btrim(p_notes), ''),
    case when p_action = 'submit_and_approve' then actor_id end,
    case when p_action = 'submit_and_approve' then now() end,
    p_idempotency_key
  ) returning id into request_id;

  for item_payload in select value from jsonb_array_elements(p_items)
  loop
    item_id := nullif(item_payload ->> 'item_id', '')::uuid;
    unit_id := nullif(item_payload ->> 'unit_id', '')::uuid;
    requested_quantity := nullif(item_payload ->> 'quantity', '')::numeric;
    item_mode := coalesce(nullif(item_payload ->> 'mode', ''), 'consumable')::public.request_item_mode;
    stock_quantity := app_private.to_stock_quantity(p_organization_id, item_id, unit_id, requested_quantity);

    insert into public.stock_request_items (
      organization_id, request_id, item_id, requested_quantity,
      requested_unit_id, requested_quantity_in_stock_unit, mode, notes
    ) values (
      p_organization_id, request_id, item_id, requested_quantity,
      unit_id, stock_quantity, item_mode, nullif(btrim(item_payload ->> 'notes'), '')
    );
  end loop;

  insert into public.stock_request_events (
    organization_id, request_id, event_type, actor_id, details, idempotency_key
  ) values (
    p_organization_id,
    request_id,
    case request_status when 'draft' then 'draft_saved' when 'pending' then 'submitted' else 'submitted_and_approved' end,
    actor_id,
    jsonb_build_object('request_number', request_number, 'status', request_status),
    case when p_idempotency_key is null then null else 'request-event:' || p_idempotency_key end
  );

  return request_id;
exception
  when unique_violation then
    if p_idempotency_key is not null then
      select existing.id into request_id
      from public.stock_requests existing
      where existing.organization_id = p_organization_id
        and existing.idempotency_key = p_idempotency_key;
      if request_id is not null then return request_id; end if;
    end if;
    raise;
end;
$$;

create or replace function public.submit_stock_request(
  p_request_id uuid,
  p_approve boolean default false,
  p_idempotency_key text default null
)
returns public.request_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_record public.stock_requests%rowtype;
  next_status public.request_status;
begin
  select * into request_record from public.stock_requests where id = p_request_id for update;
  if not found then raise exception 'Stock request not found.' using errcode = 'P0002'; end if;
  if not app_private.subscription_is_active(request_record.organization_id)
    or not app_private.has_any_permission(request_record.organization_id, array['agricRequests']::public.app_permission[]) then
    raise exception 'You do not have permission to submit this request.' using errcode = '42501';
  end if;
  if request_record.requested_by <> (select auth.uid()) and not app_private.can_approve_requests(request_record.organization_id) then
    raise exception 'Only the requester or an authorized manager can submit this request.' using errcode = '42501';
  end if;
  if request_record.status <> 'draft' then
    if p_idempotency_key is not null and exists (
      select 1 from public.stock_request_events event
      where event.organization_id = request_record.organization_id
        and event.idempotency_key = p_idempotency_key
    ) then
      return request_record.status;
    end if;
    raise exception 'Only draft requests can be submitted.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.stock_request_items item where item.request_id = p_request_id) then
    raise exception 'At least one request item is required.' using errcode = '23514';
  end if;
  if p_approve and not app_private.can_approve_requests(request_record.organization_id) then
    raise exception 'Only an owner or authorized manager can approve this request.' using errcode = '42501';
  end if;

  next_status := case when p_approve then 'approved'::public.request_status else 'pending'::public.request_status end;
  update public.stock_requests
  set status = next_status,
      approved_by = case when p_approve then (select auth.uid()) else null end,
      approved_at = case when p_approve then now() else null end
  where id = p_request_id;

  insert into public.stock_request_events (organization_id, request_id, event_type, actor_id, details, idempotency_key)
  values (
    request_record.organization_id, p_request_id,
    case when p_approve then 'submitted_and_approved' else 'submitted' end,
    (select auth.uid()), jsonb_build_object('status', next_status), p_idempotency_key
  );

  return next_status;
end;
$$;

create or replace function public.update_draft_stock_request(
  p_request_id uuid,
  p_items jsonb,
  p_farm_zone_id uuid default null,
  p_required_by_date date default null,
  p_priority text default 'normal',
  p_notes text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_record public.stock_requests%rowtype;
  zone_name text;
  item_payload jsonb;
  item_id uuid;
  unit_id uuid;
  requested_quantity numeric;
begin
  select * into request_record from public.stock_requests where id = p_request_id for update;
  if not found then raise exception 'Stock request not found.' using errcode = 'P0002'; end if;
  if request_record.status <> 'draft' then
    raise exception 'Only draft requests can be edited.' using errcode = '23514';
  end if;
  if request_record.requested_by <> (select auth.uid()) and not app_private.can_approve_requests(request_record.organization_id) then
    raise exception 'Only the requester or an authorized manager can edit this draft.' using errcode = '42501';
  end if;
  if not app_private.subscription_is_active(request_record.organization_id) then
    raise exception 'The organization subscription is not active.' using errcode = '42501';
  end if;
  if p_priority not in ('normal', 'urgent') then
    raise exception 'Priority must be normal or urgent.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one request item is required.' using errcode = '22023';
  end if;

  if p_farm_zone_id is not null then
    select zone.name into zone_name from public.farm_zones zone
    where zone.id = p_farm_zone_id and zone.organization_id = request_record.organization_id and zone.active;
    if zone_name is null then raise exception 'The selected farm zone is unavailable.' using errcode = '23503'; end if;
  end if;

  update public.stock_requests
  set farm_zone_id = p_farm_zone_id,
      farm_zone_name = zone_name,
      required_by_date = p_required_by_date,
      priority = p_priority,
      notes = nullif(btrim(p_notes), '')
  where id = request_record.id;

  delete from public.stock_request_items where request_id = request_record.id;
  for item_payload in select value from jsonb_array_elements(p_items)
  loop
    item_id := nullif(item_payload ->> 'item_id', '')::uuid;
    unit_id := nullif(item_payload ->> 'unit_id', '')::uuid;
    requested_quantity := nullif(item_payload ->> 'quantity', '')::numeric;
    insert into public.stock_request_items (
      organization_id, request_id, item_id, requested_quantity,
      requested_unit_id, requested_quantity_in_stock_unit, mode, notes
    ) values (
      request_record.organization_id, request_record.id, item_id, requested_quantity,
      unit_id,
      app_private.to_stock_quantity(request_record.organization_id, item_id, unit_id, requested_quantity),
      coalesce(nullif(item_payload ->> 'mode', ''), 'consumable')::public.request_item_mode,
      nullif(btrim(item_payload ->> 'notes'), '')
    );
  end loop;

  insert into public.stock_request_events (organization_id, request_id, event_type, actor_id, details, idempotency_key)
  values (
    request_record.organization_id, request_record.id, 'draft_updated', (select auth.uid()),
    jsonb_build_object('item_count', jsonb_array_length(p_items)), p_idempotency_key
  );
  return request_record.id;
end;
$$;

create or replace function public.cancel_stock_request(
  p_request_id uuid,
  p_reason text,
  p_idempotency_key text default null
)
returns public.request_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_record public.stock_requests%rowtype;
begin
  select * into request_record from public.stock_requests where id = p_request_id for update;
  if not found then raise exception 'Stock request not found.' using errcode = 'P0002'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A cancellation reason is required.' using errcode = '22023';
  end if;
  if request_record.requested_by <> (select auth.uid()) and not app_private.can_approve_requests(request_record.organization_id) then
    raise exception 'You do not have permission to cancel this request.' using errcode = '42501';
  end if;
  if request_record.status not in ('draft', 'pending', 'approved') then
    if p_idempotency_key is not null and exists (
      select 1 from public.stock_request_events event
      where event.organization_id = request_record.organization_id and event.idempotency_key = p_idempotency_key
    ) then return request_record.status; end if;
    raise exception 'This request can no longer be cancelled.' using errcode = '23514';
  end if;
  if exists (select 1 from public.stock_issues issue where issue.request_id = request_record.id) then
    raise exception 'A request with issued stock cannot be cancelled.' using errcode = '23514';
  end if;

  update public.stock_requests set status = 'cancelled', closed_at = now() where id = request_record.id;
  insert into public.stock_request_events (organization_id, request_id, event_type, actor_id, details, idempotency_key)
  values (
    request_record.organization_id, request_record.id, 'cancelled', (select auth.uid()),
    jsonb_build_object('reason', btrim(p_reason)), p_idempotency_key
  );
  return 'cancelled';
end;
$$;

create or replace function public.decide_stock_request(
  p_request_id uuid,
  p_decision text,
  p_reason text default null,
  p_idempotency_key text default null
)
returns public.request_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_record public.stock_requests%rowtype;
  next_status public.request_status;
begin
  select * into request_record from public.stock_requests where id = p_request_id for update;
  if not found then raise exception 'Stock request not found.' using errcode = 'P0002'; end if;
  if not app_private.can_approve_requests(request_record.organization_id) then
    raise exception 'Only an owner or authorized manager can approve or reject requests.' using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'Decision must be approve or reject.' using errcode = '22023';
  end if;
  if p_decision = 'reject' and char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A rejection reason is required.' using errcode = '22023';
  end if;
  if request_record.status <> 'pending' then
    if p_idempotency_key is not null and exists (
      select 1 from public.stock_request_events event
      where event.organization_id = request_record.organization_id
        and event.idempotency_key = p_idempotency_key
    ) then
      return request_record.status;
    end if;
    raise exception 'Only pending requests can be approved or rejected.' using errcode = '23514';
  end if;

  next_status := case when p_decision = 'approve' then 'approved'::public.request_status else 'rejected'::public.request_status end;
  update public.stock_requests
  set status = next_status,
      approved_by = case when p_decision = 'approve' then (select auth.uid()) else null end,
      approved_at = case when p_decision = 'approve' then now() else null end,
      rejected_by = case when p_decision = 'reject' then (select auth.uid()) else null end,
      rejected_at = case when p_decision = 'reject' then now() else null end,
      rejection_reason = case when p_decision = 'reject' then btrim(p_reason) else null end
  where id = p_request_id;

  insert into public.stock_request_events (organization_id, request_id, event_type, actor_id, details, idempotency_key)
  values (
    request_record.organization_id, p_request_id,
    case when p_decision = 'approve' then 'approved' else 'rejected' end,
    (select auth.uid()), jsonb_build_object('reason', nullif(btrim(p_reason), ''), 'status', next_status), p_idempotency_key
  );
  return next_status;
end;
$$;

create or replace function public.receive_inventory_stock(
  p_organization_id uuid,
  p_item_id uuid,
  p_quantity numeric,
  p_unit_id uuid,
  p_received_at timestamptz default now(),
  p_unit_cost numeric default null,
  p_source_type text default 'purchase',
  p_source_id uuid default null,
  p_notes text default null,
  p_idempotency_key text default null,
  p_opening_balance boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  stock_quantity numeric;
begin
  if not app_private.subscription_is_active(p_organization_id)
    or not app_private.has_any_permission(p_organization_id, array['agricStock']::public.app_permission[]) then
    raise exception 'You do not have permission to receive stock.' using errcode = '42501';
  end if;

  stock_quantity := app_private.to_stock_quantity(p_organization_id, p_item_id, p_unit_id, p_quantity);
  return public.record_inventory_movement(
    p_organization_id,
    p_item_id,
    case when p_opening_balance then 'opening'::public.inventory_movement_type else 'receipt'::public.inventory_movement_type end,
    stock_quantity,
    p_received_at,
    p_quantity,
    p_unit_id,
    p_unit_cost,
    null,
    nullif(btrim(p_source_type), ''),
    p_source_id,
    nullif(btrim(p_notes), ''),
    jsonb_build_object('stock_quantity', stock_quantity),
    p_idempotency_key,
    null
  );
end;
$$;

create or replace function public.dispatch_stock_request_item(
  p_request_item_id uuid,
  p_quantity numeric,
  p_unit_id uuid,
  p_issued_to uuid default null,
  p_issued_to_name text default null,
  p_issued_at timestamptz default now(),
  p_expected_return_at timestamptz default null,
  p_notes text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_item public.stock_request_items%rowtype;
  request_record public.stock_requests%rowtype;
  issue_id uuid;
  movement_id uuid;
  stock_unit_id uuid;
  stock_quantity numeric;
  issued_quantity numeric;
  remaining_quantity numeric;
  unresolved_items bigint;
  recipient_id uuid;
  recipient_name text;
  next_status public.request_status;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;

  select * into request_item
  from public.stock_request_items
  where id = p_request_item_id
  for update;
  if not found then raise exception 'Request item not found.' using errcode = 'P0002'; end if;

  select * into request_record
  from public.stock_requests
  where id = request_item.request_id
    and organization_id = request_item.organization_id
  for update;

  if not app_private.subscription_is_active(request_item.organization_id)
    or not app_private.has_any_permission(request_item.organization_id, array['agricStock']::public.app_permission[]) then
    raise exception 'You do not have permission to fulfil stock requests.' using errcode = '42501';
  end if;
  if request_record.status not in ('approved', 'partially_fulfilled') then
    raise exception 'Only approved requests can be fulfilled.' using errcode = '23514';
  end if;

  if p_idempotency_key is not null then
    select issue.id into issue_id
    from public.stock_issues issue
    where issue.organization_id = request_item.organization_id
      and issue.idempotency_key = p_idempotency_key;
    if issue_id is not null then return issue_id; end if;
  end if;

  stock_quantity := app_private.to_stock_quantity(request_item.organization_id, request_item.item_id, p_unit_id, p_quantity);
  select item.stock_unit_id into stock_unit_id
  from public.inventory_items item where item.id = request_item.item_id;
  select coalesce(sum(issue.quantity), 0) into issued_quantity
  from public.stock_issues issue where issue.request_item_id = request_item.id;
  remaining_quantity := request_item.requested_quantity_in_stock_unit - issued_quantity;

  if stock_quantity > remaining_quantity then
    raise exception 'The issue exceeds the unfulfilled quantity. Remaining in stock units: %.', remaining_quantity using errcode = '23514';
  end if;
  if request_item.mode = 'returnable' and p_expected_return_at is null then
    raise exception 'An expected return date is required for returnable stock.' using errcode = '22023';
  end if;
  if request_item.mode = 'consumable' and p_expected_return_at is not null then
    raise exception 'Consumable stock must not have a return date.' using errcode = '22023';
  end if;

  recipient_id := coalesce(p_issued_to, request_record.requested_by);
  select profile.display_name into recipient_name from public.profiles profile where profile.id = recipient_id;
  recipient_name := coalesce(nullif(btrim(p_issued_to_name), ''), nullif(btrim(recipient_name), ''), request_record.requested_by_name);

  issue_id := gen_random_uuid();
  movement_id := public.record_inventory_movement(
    request_item.organization_id, request_item.item_id, 'issue', -stock_quantity, p_issued_at,
    p_quantity, p_unit_id, null, request_record.farm_zone_id,
    'stock_issue', issue_id, p_notes,
    jsonb_build_object('request_id', request_record.id, 'request_item_id', request_item.id),
    case when p_idempotency_key is null then null else 'issue-movement:' || p_idempotency_key end,
    null
  );

  insert into public.stock_issues (
    id, organization_id, request_id, request_item_id, item_id, quantity,
    stock_unit_id, mode, issued_to, issued_to_name, issued_by, issued_at,
    expected_return_at, notes, inventory_movement_id, idempotency_key
  ) values (
    issue_id, request_item.organization_id, request_record.id, request_item.id, request_item.item_id, stock_quantity,
    stock_unit_id, request_item.mode, recipient_id, recipient_name, (select auth.uid()), p_issued_at,
    p_expected_return_at, nullif(btrim(p_notes), ''), movement_id, p_idempotency_key
  );

  select count(*) into unresolved_items
  from public.stock_request_items item
  where item.request_id = request_record.id
    and item.requested_quantity_in_stock_unit > (
      select coalesce(sum(issue.quantity), 0)
      from public.stock_issues issue
      where issue.request_item_id = item.id
    );

  next_status := case when unresolved_items = 0 then 'dispatched'::public.request_status else 'partially_fulfilled'::public.request_status end;
  update public.stock_requests set status = next_status where id = request_record.id;
  insert into public.stock_request_events (organization_id, request_id, event_type, actor_id, details, idempotency_key)
  values (
    request_item.organization_id, request_record.id, 'stock_issued', (select auth.uid()),
    jsonb_build_object('issue_id', issue_id, 'request_item_id', request_item.id, 'quantity_in_stock_unit', stock_quantity, 'status', next_status),
    case when p_idempotency_key is null then null else 'issue-event:' || p_idempotency_key end
  );

  return issue_id;
end;
$$;

create or replace function public.record_stock_issue_usage(
  p_issue_id uuid,
  p_quantity numeric,
  p_unit_id uuid,
  p_applied_at timestamptz default now(),
  p_farm_zone_id uuid default null,
  p_applied_by_name text default null,
  p_batch_number text default null,
  p_notes text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  issue public.stock_issues%rowtype;
  request_record public.stock_requests%rowtype;
  usage_id uuid;
  stock_quantity numeric;
  used_quantity numeric;
  actor_name text;
  week_record record;
  next_status public.request_status;
begin
  select * into issue from public.stock_issues where id = p_issue_id for update;
  if not found then raise exception 'Stock issue not found.' using errcode = 'P0002'; end if;
  if issue.mode <> 'consumable' then
    raise exception 'Returnable stock must be returned, not marked as used.' using errcode = '23514';
  end if;
  if not app_private.subscription_is_active(issue.organization_id)
    or not app_private.has_any_permission(issue.organization_id, array['agricStock','agricUsage']::public.app_permission[]) then
    raise exception 'You do not have permission to record usage.' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select log.id into usage_id from public.usage_logs log
    where log.organization_id = issue.organization_id and log.idempotency_key = p_idempotency_key;
    if usage_id is not null then return usage_id; end if;
  end if;

  stock_quantity := app_private.to_stock_quantity(issue.organization_id, issue.item_id, p_unit_id, p_quantity);
  select coalesce(sum(log.quantity_in_stock_unit), 0) into used_quantity
  from public.usage_logs log where log.issue_id = issue.id;
  if used_quantity + stock_quantity > issue.quantity then
    raise exception 'Usage exceeds the quantity issued. Remaining in stock units: %.', issue.quantity - used_quantity using errcode = '23514';
  end if;

  select * into request_record from public.stock_requests where id = issue.request_id;
  select profile.display_name into actor_name from public.profiles profile where profile.id = (select auth.uid());
  actor_name := coalesce(nullif(btrim(p_applied_by_name), ''), nullif(btrim(actor_name), ''), 'Team member');
  select * into week_record from app_private.farm_week_for_date(issue.organization_id, p_applied_at::date);

  insert into public.usage_logs (
    organization_id, item_id, issue_id, farm_zone_id, applied_at,
    quantity, unit_id, quantity_in_stock_unit, applied_by_name,
    batch_number, notes, farm_week, farm_week_year, week_start_date,
    week_end_date, inventory_movement_id, recorded_by, idempotency_key
  ) values (
    issue.organization_id, issue.item_id, issue.id, coalesce(p_farm_zone_id, request_record.farm_zone_id), p_applied_at,
    p_quantity, p_unit_id, stock_quantity, actor_name,
    nullif(btrim(p_batch_number), ''), nullif(btrim(p_notes), ''), week_record.week_number,
    week_record.week_year, week_record.week_start, week_record.week_end,
    issue.inventory_movement_id, (select auth.uid()), p_idempotency_key
  ) returning id into usage_id;

  if used_quantity + stock_quantity = issue.quantity then
    update public.stock_issues
    set usage_recorded_at = p_applied_at, usage_recorded_by = (select auth.uid())
    where id = issue.id;
  end if;

  next_status := app_private.refresh_stock_request_status(issue.request_id);

  insert into public.stock_request_events (organization_id, request_id, event_type, actor_id, details, idempotency_key)
  values (
    issue.organization_id, issue.request_id, 'usage_recorded', (select auth.uid()),
    jsonb_build_object('issue_id', issue.id, 'usage_id', usage_id, 'quantity_in_stock_unit', stock_quantity, 'status', next_status),
    case when p_idempotency_key is null then null else 'usage-event:' || p_idempotency_key end
  );
  return usage_id;
end;
$$;

create or replace function app_private.refresh_stock_request_status(target_request_id uuid)
returns public.request_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_record public.stock_requests%rowtype;
  has_unfulfilled boolean;
  has_unresolved boolean;
  next_status public.request_status;
begin
  select * into request_record from public.stock_requests where id = target_request_id for update;
  if not found then raise exception 'Stock request not found.' using errcode = 'P0002'; end if;

  select exists (
    select 1
    from public.stock_request_items item
    where item.request_id = request_record.id
      and item.requested_quantity_in_stock_unit > (
        select coalesce(sum(issue.quantity), 0)
        from public.stock_issues issue
        where issue.request_item_id = item.id
      )
  ) into has_unfulfilled;

  if has_unfulfilled then
    next_status := case
      when exists (select 1 from public.stock_issues issue where issue.request_id = request_record.id)
        then 'partially_fulfilled'::public.request_status
      else 'approved'::public.request_status
    end;
  else
    select exists (
      select 1
      from public.stock_issues issue
      where issue.request_id = request_record.id
        and (
          (issue.mode = 'consumable' and issue.quantity > (
            select coalesce(sum(log.quantity_in_stock_unit), 0)
            from public.usage_logs log where log.issue_id = issue.id
          ))
          or
          (issue.mode = 'returnable' and issue.quantity > (
            select coalesce(sum(return_record.quantity), 0)
            from public.stock_issue_returns return_record where return_record.issue_id = issue.id
          ))
        )
    ) into has_unresolved;
    next_status := case when has_unresolved then 'dispatched'::public.request_status else 'closed'::public.request_status end;
  end if;

  update public.stock_requests
  set status = next_status,
      closed_at = case when next_status = 'closed' then coalesce(closed_at, now()) else null end
  where id = request_record.id;
  return next_status;
end;
$$;

create or replace function public.return_stock_issue(
  p_issue_id uuid,
  p_quantity numeric,
  p_unit_id uuid,
  p_condition public.return_condition default 'good',
  p_returned_at timestamptz default now(),
  p_notes text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  issue public.stock_issues%rowtype;
  return_id uuid;
  movement_id uuid;
  stock_quantity numeric;
  reconciled_quantity numeric;
  next_status public.request_status;
begin
  select * into issue from public.stock_issues where id = p_issue_id for update;
  if not found then raise exception 'Stock issue not found.' using errcode = 'P0002'; end if;
  if issue.mode <> 'returnable' then
    raise exception 'Only returnable stock can be returned.' using errcode = '23514';
  end if;
  if not app_private.subscription_is_active(issue.organization_id)
    or not app_private.has_any_permission(issue.organization_id, array['agricStock','agricRequests']::public.app_permission[]) then
    raise exception 'You do not have permission to record returns.' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select return_record.id into return_id from public.stock_issue_returns return_record
    where return_record.organization_id = issue.organization_id
      and return_record.idempotency_key = p_idempotency_key;
    if return_id is not null then return return_id; end if;
  end if;

  stock_quantity := app_private.to_stock_quantity(issue.organization_id, issue.item_id, p_unit_id, p_quantity);
  select coalesce(sum(return_record.quantity), 0) into reconciled_quantity
  from public.stock_issue_returns return_record where return_record.issue_id = issue.id;
  if reconciled_quantity + stock_quantity > issue.quantity then
    raise exception 'The return exceeds the unresolved quantity. Remaining in stock units: %.', issue.quantity - reconciled_quantity using errcode = '23514';
  end if;

  return_id := gen_random_uuid();
  if p_condition = 'good' then
    movement_id := public.record_inventory_movement(
      issue.organization_id, issue.item_id, 'return', stock_quantity, p_returned_at,
      p_quantity, p_unit_id, null, null,
      'stock_issue_return', return_id, p_notes,
      jsonb_build_object('issue_id', issue.id, 'condition', p_condition),
      case when p_idempotency_key is null then null else 'return-movement:' || p_idempotency_key end,
      null
    );
  end if;

  insert into public.stock_issue_returns (
    id, organization_id, issue_id, quantity, condition, returned_by,
    returned_at, notes, inventory_movement_id, idempotency_key
  ) values (
    return_id, issue.organization_id, issue.id, stock_quantity, p_condition, (select auth.uid()),
    p_returned_at, nullif(btrim(p_notes), ''), movement_id, p_idempotency_key
  );

  update public.stock_issues
  set returned_quantity = returned_quantity + case when p_condition = 'good' then stock_quantity else 0 end,
      damaged_quantity = damaged_quantity + case when p_condition = 'damaged' then stock_quantity else 0 end,
      lost_quantity = lost_quantity + case when p_condition = 'lost' then stock_quantity else 0 end
  where id = issue.id;

  next_status := app_private.refresh_stock_request_status(issue.request_id);
  insert into public.stock_request_events (organization_id, request_id, event_type, actor_id, details, idempotency_key)
  values (
    issue.organization_id, issue.request_id, 'stock_returned', (select auth.uid()),
    jsonb_build_object('issue_id', issue.id, 'return_id', return_id, 'condition', p_condition, 'quantity_in_stock_unit', stock_quantity, 'status', next_status),
    case when p_idempotency_key is null then null else 'return-event:' || p_idempotency_key end
  );
  return return_id;
end;
$$;

create or replace function public.record_direct_inventory_usage(
  p_organization_id uuid,
  p_item_id uuid,
  p_quantity numeric,
  p_unit_id uuid,
  p_applied_at timestamptz default now(),
  p_farm_zone_id uuid default null,
  p_applied_by_name text default null,
  p_batch_number text default null,
  p_notes text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  usage_id uuid;
  movement_id uuid;
  stock_quantity numeric;
  actor_name text;
  week_record record;
begin
  if not app_private.subscription_is_active(p_organization_id)
    or not app_private.has_any_permission(p_organization_id, array['agricUsage']::public.app_permission[]) then
    raise exception 'You do not have permission to record usage.' using errcode = '42501';
  end if;
  if p_idempotency_key is not null then
    select log.id into usage_id from public.usage_logs log
    where log.organization_id = p_organization_id and log.idempotency_key = p_idempotency_key;
    if usage_id is not null then return usage_id; end if;
  end if;

  stock_quantity := app_private.to_stock_quantity(p_organization_id, p_item_id, p_unit_id, p_quantity);
  usage_id := gen_random_uuid();
  movement_id := public.record_inventory_movement(
    p_organization_id, p_item_id, 'usage', -stock_quantity, p_applied_at,
    p_quantity, p_unit_id, null, p_farm_zone_id,
    'usage_log', usage_id, p_notes,
    jsonb_build_object('quantity_in_stock_unit', stock_quantity),
    case when p_idempotency_key is null then null else 'direct-usage-movement:' || p_idempotency_key end,
    null
  );

  select profile.display_name into actor_name from public.profiles profile where profile.id = (select auth.uid());
  actor_name := coalesce(nullif(btrim(p_applied_by_name), ''), nullif(btrim(actor_name), ''), 'Team member');
  select * into week_record from app_private.farm_week_for_date(p_organization_id, p_applied_at::date);
  insert into public.usage_logs (
    id, organization_id, item_id, farm_zone_id, applied_at, quantity, unit_id,
    quantity_in_stock_unit, applied_by_name, batch_number, notes, farm_week,
    farm_week_year, week_start_date, week_end_date, inventory_movement_id,
    recorded_by, idempotency_key
  ) values (
    usage_id, p_organization_id, p_item_id, p_farm_zone_id, p_applied_at, p_quantity, p_unit_id,
    stock_quantity, actor_name, nullif(btrim(p_batch_number), ''), nullif(btrim(p_notes), ''),
    week_record.week_number, week_record.week_year, week_record.week_start, week_record.week_end,
    movement_id, (select auth.uid()), p_idempotency_key
  );
  return usage_id;
end;
$$;

alter table public.packing_records
  add constraint packing_records_export_standard_check
  check (market <> 'export' or quality_standard_id is not null);

alter table public.shipments
  add constraint shipments_export_standard_check
  check (market <> 'export' or quality_standard_snapshot <> '{}'::jsonb);

create or replace function app_private.protect_packing_record_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.workflow_write', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' and (
    new.inspected_packages <> 0
    or new.accepted_packages <> 0
    or new.rejected_packages <> 0
    or new.rework_packages <> 0
    or new.inspection_status <> 'awaiting_inspection'
  ) then
    raise exception 'Inspection totals must be recorded through the quality workflow.' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and (
    new.inspected_packages is distinct from old.inspected_packages
    or new.accepted_packages is distinct from old.accepted_packages
    or new.rejected_packages is distinct from old.rejected_packages
    or new.rework_packages is distinct from old.rework_packages
    or new.inspection_status is distinct from old.inspection_status
  ) then
    raise exception 'Inspection totals must be changed through a quality event.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger protect_packing_record_totals_before_write
  before insert or update on public.packing_records
  for each row execute function app_private.protect_packing_record_totals();

create or replace function public.record_packing_quality_event(
  p_packing_record_id uuid,
  p_event_type public.quality_event_type,
  p_inspected_delta numeric,
  p_accepted_delta numeric,
  p_rejected_delta numeric,
  p_rework_delta numeric,
  p_confirmed_checks text[] default array[]::text[],
  p_reason text default null,
  p_notes text default null,
  p_inspected_at timestamptz default now(),
  p_correction_of uuid default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  packing_record public.packing_records%rowtype;
  event_id uuid;
  inspector_name text;
  next_inspected numeric;
  next_accepted numeric;
  next_rejected numeric;
  next_rework numeric;
  next_status public.inspection_status;
begin
  select * into packing_record from public.packing_records where id = p_packing_record_id for update;
  if not found then raise exception 'Packing record not found.' using errcode = 'P0002'; end if;
  if packing_record.archived_at is not null then
    raise exception 'Archived packing records cannot be inspected.' using errcode = '23514';
  end if;
  if not app_private.subscription_is_active(packing_record.organization_id)
    or not app_private.has_any_permission(packing_record.organization_id, array['agricPacking']::public.app_permission[]) then
    raise exception 'You do not have permission to record quality inspections.' using errcode = '42501';
  end if;
  if p_event_type = 'correction' and (
    not app_private.can_manage_org(packing_record.organization_id)
    or p_correction_of is null
    or char_length(btrim(coalesce(p_reason, ''))) < 3
  ) then
    raise exception 'Corrections require an authorized manager, the corrected event, and a reason.' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select quality_event.id into event_id from public.packing_quality_events quality_event
    where quality_event.organization_id = packing_record.organization_id
      and quality_event.idempotency_key = p_idempotency_key;
    if event_id is not null then return event_id; end if;
  end if;

  if p_event_type = 'inspection' and (
    p_inspected_delta <= 0
    or p_accepted_delta < 0
    or p_rejected_delta < 0
    or p_rework_delta < 0
    or p_inspected_delta <> p_accepted_delta + p_rejected_delta + p_rework_delta
  ) then
    raise exception 'Inspection quantities must be non-negative and add up to the inspected quantity.' using errcode = '23514';
  end if;
  if p_event_type = 'rework_resolution' and (
    p_inspected_delta <> 0
    or p_accepted_delta < 0
    or p_rejected_delta < 0
    or p_rework_delta <> -(p_accepted_delta + p_rejected_delta)
  ) then
    raise exception 'Rework resolution must move rework packages into accepted or rejected quantities.' using errcode = '23514';
  end if;

  next_inspected := packing_record.inspected_packages + p_inspected_delta;
  next_accepted := packing_record.accepted_packages + p_accepted_delta;
  next_rejected := packing_record.rejected_packages + p_rejected_delta;
  next_rework := packing_record.rework_packages + p_rework_delta;
  if least(next_inspected, next_accepted, next_rejected, next_rework) < 0
    or next_inspected > packing_record.packed_packages
    or next_inspected <> next_accepted + next_rejected + next_rework then
    raise exception 'The quality event would produce invalid packing totals.' using errcode = '23514';
  end if;

  next_status := case
    when next_inspected = 0 then 'awaiting_inspection'::public.inspection_status
    when next_inspected < packing_record.packed_packages then 'partially_accepted'::public.inspection_status
    when next_rework > 0 then 'rework'::public.inspection_status
    when next_accepted = 0 then 'rejected'::public.inspection_status
    when next_rejected > 0 then 'partially_accepted'::public.inspection_status
    else 'accepted'::public.inspection_status
  end;

  select profile.display_name into inspector_name from public.profiles profile where profile.id = (select auth.uid());
  inspector_name := coalesce(nullif(btrim(inspector_name), ''), app_private.current_email()::text, 'Inspector');
  event_id := gen_random_uuid();
  insert into public.packing_quality_events (
    id, organization_id, packing_record_id, event_type, inspected_delta,
    accepted_delta, rejected_delta, rework_delta, confirmed_checks,
    reason, notes, inspector_id, inspector_name, inspected_at,
    standard_snapshot, correction_of, idempotency_key
  ) values (
    event_id, packing_record.organization_id, packing_record.id, p_event_type, p_inspected_delta,
    p_accepted_delta, p_rejected_delta, p_rework_delta, coalesce(p_confirmed_checks, array[]::text[]),
    nullif(btrim(p_reason), ''), nullif(btrim(p_notes), ''), (select auth.uid()), inspector_name, p_inspected_at,
    packing_record.quality_standard_snapshot, p_correction_of, p_idempotency_key
  );

  perform set_config('app.workflow_write', 'on', true);
  update public.packing_records
  set inspected_packages = next_inspected,
      accepted_packages = next_accepted,
      rejected_packages = next_rejected,
      rework_packages = next_rework,
      inspection_status = next_status
  where id = packing_record.id;
  perform set_config('app.workflow_write', 'off', true);
  return event_id;
end;
$$;

create or replace function public.create_shipment(
  p_organization_id uuid,
  p_allocations jsonb,
  p_destination_name text,
  p_market public.market_scope,
  p_produce text,
  p_dispatched_at timestamptz default now(),
  p_station_id uuid default null,
  p_customer_id uuid default null,
  p_destination_country text default null,
  p_transport_profile_id uuid default null,
  p_vehicle_identifier text default null,
  p_driver_name text default null,
  p_weight_shipped_kg numeric default null,
  p_notes text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  shipment_id uuid;
  shipment_number text;
  allocation_payload jsonb;
  packing_record public.packing_records%rowtype;
  packing_record_id uuid;
  allocation_packages numeric;
  allocated_packages numeric;
  available_packages numeric;
  total_packages numeric := 0;
  quality_snapshot jsonb := '{}'::jsonb;
  resolved_station_id uuid := p_station_id;
begin
  if not app_private.subscription_is_active(p_organization_id)
    or not app_private.has_any_permission(p_organization_id, array['agricPacking']::public.app_permission[]) then
    raise exception 'You do not have permission to create shipments.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_destination_name, ''))) < 2
    or char_length(btrim(coalesce(p_produce, ''))) < 1 then
    raise exception 'Destination and produce are required.' using errcode = '22023';
  end if;
  if p_market = 'export' and char_length(btrim(coalesce(p_destination_country, ''))) < 2 then
    raise exception 'Destination country is required for export shipments.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) = 0 then
    raise exception 'At least one accepted packing lot must be allocated.' using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    perform app_private.lock_feature_quota(p_organization_id, 'shipment:' || p_idempotency_key);
    select existing.id into shipment_id from public.shipments existing
    where existing.organization_id = p_organization_id and existing.idempotency_key = p_idempotency_key;
    if shipment_id is not null then return shipment_id; end if;
  end if;

  perform record.id
  from public.packing_records record
  where record.organization_id = p_organization_id
    and record.id in (
      select (value ->> 'packing_record_id')::uuid from jsonb_array_elements(p_allocations)
    )
  order by record.id
  for update;

  shipment_id := gen_random_uuid();
  shipment_number := app_private.next_document_number(p_organization_id, 'shipment', 'SHP');

  for allocation_payload in select value from jsonb_array_elements(p_allocations)
  loop
    packing_record_id := nullif(allocation_payload ->> 'packing_record_id', '')::uuid;
    allocation_packages := nullif(allocation_payload ->> 'packages', '')::numeric;
    if allocation_packages is null or allocation_packages <= 0 then
      raise exception 'Every shipment allocation must have a positive package quantity.' using errcode = '22023';
    end if;

    select * into packing_record
    from public.packing_records record
    where record.id = packing_record_id and record.organization_id = p_organization_id;
    if not found or packing_record.archived_at is not null then
      raise exception 'A selected packing record is unavailable.' using errcode = 'P0002';
    end if;
    if resolved_station_id is null then
      resolved_station_id := packing_record.station_id;
    end if;
    if packing_record.produce <> p_produce or packing_record.market <> p_market
      or packing_record.station_id <> resolved_station_id then
      raise exception 'All allocated lots must match the shipment produce, market, and station.' using errcode = '23514';
    end if;
    if p_market = 'export' and packing_record.destination_country is distinct from p_destination_country then
      raise exception 'Export lot destination does not match the shipment destination.' using errcode = '23514';
    end if;

    select coalesce(sum(existing.packages), 0) into allocated_packages
    from public.shipment_allocations existing where existing.packing_record_id = packing_record.id;
    available_packages := packing_record.accepted_packages - allocated_packages;
    if allocation_packages > available_packages then
      raise exception 'Lot % has only % accepted package(s) available.', packing_record.lot_number, available_packages using errcode = '23514';
    end if;

    if quality_snapshot = '{}'::jsonb then
      quality_snapshot := packing_record.quality_standard_snapshot;
    elsif quality_snapshot is distinct from packing_record.quality_standard_snapshot then
      raise exception 'All lots in a shipment must use the same quality standard version.' using errcode = '23514';
    end if;
    total_packages := total_packages + allocation_packages;
  end loop;

  insert into public.shipments (
    id, organization_id, shipment_number, dispatched_at, station_id,
    customer_id, destination_name, destination_country, market, produce,
    packages_shipped, weight_shipped_kg, transport_profile_id,
    vehicle_identifier, driver_name, quality_standard_snapshot, notes,
    dispatched_by, idempotency_key
  ) values (
    shipment_id, p_organization_id, shipment_number, p_dispatched_at, resolved_station_id,
    p_customer_id, btrim(p_destination_name), nullif(btrim(p_destination_country), ''), p_market, btrim(p_produce),
    total_packages, p_weight_shipped_kg, p_transport_profile_id,
    nullif(btrim(p_vehicle_identifier), ''), nullif(btrim(p_driver_name), ''), quality_snapshot,
    nullif(btrim(p_notes), ''), (select auth.uid()), p_idempotency_key
  );

  for allocation_payload in select value from jsonb_array_elements(p_allocations)
  loop
    insert into public.shipment_allocations (organization_id, shipment_id, packing_record_id, packages)
    values (
      p_organization_id, shipment_id,
      (allocation_payload ->> 'packing_record_id')::uuid,
      (allocation_payload ->> 'packages')::numeric
    );
  end loop;
  return shipment_id;
end;
$$;

create or replace function public.consume_feature_usage(
  p_organization_id uuid,
  p_feature_key text,
  p_quantity numeric default 1,
  p_period_start date default date_trunc('month', current_date)::date,
  p_period_end date default (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date,
  p_source_type text default null,
  p_source_id uuid default null,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  feature_limit numeric;
  current_quantity numeric;
begin
  if (select auth.uid()) is null or not app_private.is_org_member(p_organization_id) then
    raise exception 'Organization membership is required.' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_period_end < p_period_start then
    raise exception 'Usage quantity and period are invalid.' using errcode = '22023';
  end if;
  if not app_private.feature_is_enabled(p_organization_id, p_feature_key) then
    raise exception 'This feature is not available on the organization plan.' using errcode = '42501';
  end if;

  if p_idempotency_key is not null and exists (
    select 1 from public.usage_events event
    where event.organization_id = p_organization_id and event.idempotency_key = p_idempotency_key
  ) then
    select counter.quantity into current_quantity from public.usage_period_counters counter
    where counter.organization_id = p_organization_id
      and counter.feature_key = p_feature_key
      and counter.period_start = p_period_start;
    return coalesce(current_quantity, 0);
  end if;

  perform app_private.lock_feature_quota(p_organization_id, 'usage:' || p_feature_key || ':' || p_period_start::text);
  feature_limit := app_private.entitlement_limit(p_organization_id, p_feature_key);
  select counter.quantity into current_quantity from public.usage_period_counters counter
  where counter.organization_id = p_organization_id
    and counter.feature_key = p_feature_key
    and counter.period_start = p_period_start
  for update;
  current_quantity := coalesce(current_quantity, 0);

  if feature_limit is not null and current_quantity + p_quantity > feature_limit then
    raise exception 'The % usage limit has been reached. Limit: %, used: %.', p_feature_key, feature_limit, current_quantity using errcode = '23514';
  end if;

  insert into public.usage_period_counters (organization_id, feature_key, period_start, period_end, quantity)
  values (p_organization_id, p_feature_key, p_period_start, p_period_end, current_quantity + p_quantity)
  on conflict (organization_id, feature_key, period_start) do update
    set period_end = excluded.period_end,
        quantity = excluded.quantity,
        updated_at = now();

  insert into public.usage_events (
    organization_id, feature_key, quantity, actor_id, source_type,
    source_id, idempotency_key, metadata
  ) values (
    p_organization_id, p_feature_key, p_quantity, (select auth.uid()),
    nullif(btrim(p_source_type), ''), p_source_id, p_idempotency_key, coalesce(p_metadata, '{}'::jsonb)
  );
  return current_quantity + p_quantity;
end;
$$;

create or replace function public.get_organization_entitlements(p_organization_id uuid)
returns table (
  feature_key text,
  enabled boolean,
  limit_value numeric,
  current_usage numeric,
  remaining numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app_private.is_org_member(p_organization_id) then
    raise exception 'Organization membership is required.' using errcode = '42501';
  end if;
  return query
  select
    entitlement.feature_key,
    case when app_private.is_platform_admin() then true else entitlement.enabled end,
    case
      when app_private.is_platform_admin() then null
      when subscription.override_limits ? entitlement.feature_key
        then nullif(subscription.override_limits ->> entitlement.feature_key, '')::numeric
      else entitlement.limit_value
    end,
    case entitlement.feature_key
      when 'team_members' then (
        select count(*)::numeric from public.organization_memberships membership
        where membership.organization_id = p_organization_id and membership.active
      )
      when 'inventory_items' then (
        select count(*)::numeric from public.inventory_items item
        where item.organization_id = p_organization_id and item.active
      )
      else coalesce((
        select counter.quantity from public.usage_period_counters counter
        where counter.organization_id = p_organization_id
          and counter.feature_key = entitlement.feature_key
          and current_date between counter.period_start and counter.period_end
        order by counter.period_start desc limit 1
      ), 0)
    end as current_usage,
    case
      when app_private.is_platform_admin() then null
      when coalesce(
        case when subscription.override_limits ? entitlement.feature_key
          then nullif(subscription.override_limits ->> entitlement.feature_key, '')::numeric
          else entitlement.limit_value end,
        -1
      ) < 0 then null
      else greatest(
        (case when subscription.override_limits ? entitlement.feature_key
          then nullif(subscription.override_limits ->> entitlement.feature_key, '')::numeric
          else entitlement.limit_value end)
        - case entitlement.feature_key
            when 'team_members' then (
              select count(*)::numeric from public.organization_memberships membership
              where membership.organization_id = p_organization_id and membership.active
            )
            when 'inventory_items' then (
              select count(*)::numeric from public.inventory_items item
              where item.organization_id = p_organization_id and item.active
            )
            else coalesce((
              select counter.quantity from public.usage_period_counters counter
              where counter.organization_id = p_organization_id
                and counter.feature_key = entitlement.feature_key
                and current_date between counter.period_start and counter.period_end
              order by counter.period_start desc limit 1
            ), 0)
          end,
        0
      )
    end as remaining
  from public.organization_subscriptions subscription
  join public.plan_entitlements entitlement on entitlement.plan_id = subscription.plan_id
  where subscription.organization_id = p_organization_id
  order by entitlement.feature_key;
end;
$$;

create or replace function public.admin_update_subscription(
  p_organization_id uuid,
  p_plan_id public.subscription_plan,
  p_status public.subscription_status,
  p_trial_ends_at timestamptz default null,
  p_current_period_start timestamptz default null,
  p_current_period_end timestamptz default null,
  p_override_limits jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.is_platform_admin() then
    raise exception 'Platform administrator access is required.' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_override_limits, '{}'::jsonb)) <> 'object' then
    raise exception 'Limit overrides must be a JSON object.' using errcode = '22023';
  end if;

  insert into public.organization_subscriptions (
    organization_id, plan_id, status, provider, trial_ends_at,
    current_period_start, current_period_end, override_limits
  ) values (
    p_organization_id, p_plan_id, p_status, 'internal', p_trial_ends_at,
    p_current_period_start, p_current_period_end, coalesce(p_override_limits, '{}'::jsonb)
  )
  on conflict (organization_id) do update
    set plan_id = excluded.plan_id,
        status = excluded.status,
        trial_ends_at = excluded.trial_ends_at,
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        override_limits = excluded.override_limits,
        updated_at = now();
end;
$$;

create or replace function public.admin_set_usage_counter(
  p_organization_id uuid,
  p_feature_key text,
  p_period_start date,
  p_period_end date,
  p_quantity numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.is_platform_admin() then
    raise exception 'Platform administrator access is required.' using errcode = '42501';
  end if;
  if p_quantity < 0 or p_period_end < p_period_start then
    raise exception 'Usage counter values are invalid.' using errcode = '22023';
  end if;
  insert into public.usage_period_counters (organization_id, feature_key, period_start, period_end, quantity)
  values (p_organization_id, p_feature_key, p_period_start, p_period_end, p_quantity)
  on conflict (organization_id, feature_key, period_start) do update
    set period_end = excluded.period_end, quantity = excluded.quantity, updated_at = now();
end;
$$;

create or replace function public.update_member_access(
  p_organization_id uuid,
  p_user_id uuid,
  p_role public.app_role,
  p_permissions public.app_permission[],
  p_active boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership public.organization_memberships%rowtype;
begin
  if not app_private.can_manage_org(p_organization_id) then
    raise exception 'You do not have permission to manage this team.' using errcode = '42501';
  end if;
  if p_role = 'owner' then
    raise exception 'Ownership transfers require a dedicated ownership transfer workflow.' using errcode = '42501';
  end if;

  select * into membership
  from public.organization_memberships
  where organization_id = p_organization_id and user_id = p_user_id
  for update;
  if not found then raise exception 'Team member not found.' using errcode = 'P0002'; end if;
  if membership.role = 'owner' then
    raise exception 'The organization owner cannot be edited as a regular team member.' using errcode = '42501';
  end if;

  update public.organization_memberships
  set role = p_role,
      permissions = coalesce(p_permissions, array[]::public.app_permission[]),
      active = p_active
  where organization_id = p_organization_id and user_id = p_user_id;

  insert into public.audit_events (
    organization_id, actor_id, action, entity_type, entity_id, old_record, new_record
  ) values (
    p_organization_id, (select auth.uid()), 'member_access_updated', 'organization_membership', p_user_id::text,
    jsonb_build_object('role', membership.role, 'permissions', membership.permissions, 'active', membership.active),
    jsonb_build_object('role', p_role, 'permissions', coalesce(p_permissions, array[]::public.app_permission[]), 'active', p_active)
  );
end;
$$;

create or replace function public.revoke_invitation(
  p_invitation_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.invitations%rowtype;
begin
  select * into invitation from public.invitations where id = p_invitation_id for update;
  if not found then raise exception 'Invitation not found.' using errcode = 'P0002'; end if;
  if not app_private.can_manage_org(invitation.organization_id) then
    raise exception 'You do not have permission to revoke this invitation.' using errcode = '42501';
  end if;
  if invitation.status <> 'pending' then
    raise exception 'Only pending invitations can be revoked.' using errcode = '23514';
  end if;
  update public.invitations set status = 'revoked', revoked_at = now() where id = invitation.id;
  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, new_record)
  values (
    invitation.organization_id, (select auth.uid()), 'invitation_revoked', 'invitation', invitation.id::text,
    jsonb_build_object('email', invitation.email, 'reason', nullif(btrim(p_reason), ''))
  );
end;
$$;

revoke execute on function public.record_inventory_movement(uuid, uuid, public.inventory_movement_type, numeric, timestamptz, numeric, uuid, numeric, uuid, text, uuid, text, jsonb, text, uuid) from authenticated;

revoke insert, update, delete on public.stock_requests from authenticated;
revoke insert, update, delete on public.stock_request_items from authenticated;
revoke insert, update, delete on public.usage_logs from authenticated;
revoke insert, update, delete on public.shipments from authenticated;
revoke delete on public.packing_records from authenticated;
revoke update on public.alerts from authenticated;
grant update (read_at) on public.alerts to authenticated;

drop policy if exists stock_requests_insert on public.stock_requests;
drop policy if exists stock_request_items_insert on public.stock_request_items;
drop policy if exists usage_logs_insert on public.usage_logs;
drop policy if exists usage_logs_update on public.usage_logs;

create policy packing_quality_grades_manage on public.packing_quality_grades
  for all to authenticated
  using (exists (
    select 1 from public.packing_quality_standards standard
    where standard.id = packing_quality_grades.standard_id
      and standard.organization_id is not null
      and app_private.can_manage_org(standard.organization_id)
  ))
  with check (exists (
    select 1 from public.packing_quality_standards standard
    where standard.id = packing_quality_grades.standard_id
      and standard.organization_id is not null
      and app_private.can_manage_org(standard.organization_id)
  ));

revoke all on function public.create_stock_request(uuid, jsonb, uuid, date, text, text, text, text) from public, anon;
revoke all on function public.submit_stock_request(uuid, boolean, text) from public, anon;
revoke all on function public.update_draft_stock_request(uuid, jsonb, uuid, date, text, text, text) from public, anon;
revoke all on function public.cancel_stock_request(uuid, text, text) from public, anon;
revoke all on function public.decide_stock_request(uuid, text, text, text) from public, anon;
revoke all on function public.receive_inventory_stock(uuid, uuid, numeric, uuid, timestamptz, numeric, text, uuid, text, text, boolean) from public, anon;
revoke all on function public.dispatch_stock_request_item(uuid, numeric, uuid, uuid, text, timestamptz, timestamptz, text, text) from public, anon;
revoke all on function public.record_stock_issue_usage(uuid, numeric, uuid, timestamptz, uuid, text, text, text, text) from public, anon;
revoke all on function public.return_stock_issue(uuid, numeric, uuid, public.return_condition, timestamptz, text, text) from public, anon;
revoke all on function public.record_direct_inventory_usage(uuid, uuid, numeric, uuid, timestamptz, uuid, text, text, text, text) from public, anon;
revoke all on function public.record_packing_quality_event(uuid, public.quality_event_type, numeric, numeric, numeric, numeric, text[], text, text, timestamptz, uuid, text) from public, anon;
revoke all on function public.create_shipment(uuid, jsonb, text, public.market_scope, text, timestamptz, uuid, uuid, text, uuid, text, text, numeric, text, text) from public, anon;
revoke all on function public.consume_feature_usage(uuid, text, numeric, date, date, text, uuid, text, jsonb) from public, anon;
revoke all on function public.get_organization_entitlements(uuid) from public, anon;
revoke all on function public.admin_update_subscription(uuid, public.subscription_plan, public.subscription_status, timestamptz, timestamptz, timestamptz, jsonb) from public, anon;
revoke all on function public.admin_set_usage_counter(uuid, text, date, date, numeric) from public, anon;
revoke all on function public.update_member_access(uuid, uuid, public.app_role, public.app_permission[], boolean) from public, anon;
revoke all on function public.revoke_invitation(uuid, text) from public, anon;

revoke all on function app_private.enforce_membership_limit() from public, anon, authenticated;
revoke all on function app_private.enforce_inventory_item_limit() from public, anon, authenticated;
revoke all on function app_private.snapshot_packing_quality_standard() from public, anon, authenticated;
revoke all on function app_private.protect_packing_record_totals() from public, anon, authenticated;
revoke all on function app_private.refresh_stock_request_status(uuid) from public, anon, authenticated;

grant execute on function public.create_stock_request(uuid, jsonb, uuid, date, text, text, text, text) to authenticated;
grant execute on function public.submit_stock_request(uuid, boolean, text) to authenticated;
grant execute on function public.update_draft_stock_request(uuid, jsonb, uuid, date, text, text, text) to authenticated;
grant execute on function public.cancel_stock_request(uuid, text, text) to authenticated;
grant execute on function public.decide_stock_request(uuid, text, text, text) to authenticated;
grant execute on function public.receive_inventory_stock(uuid, uuid, numeric, uuid, timestamptz, numeric, text, uuid, text, text, boolean) to authenticated;
grant execute on function public.dispatch_stock_request_item(uuid, numeric, uuid, uuid, text, timestamptz, timestamptz, text, text) to authenticated;
grant execute on function public.record_stock_issue_usage(uuid, numeric, uuid, timestamptz, uuid, text, text, text, text) to authenticated;
grant execute on function public.return_stock_issue(uuid, numeric, uuid, public.return_condition, timestamptz, text, text) to authenticated;
grant execute on function public.record_direct_inventory_usage(uuid, uuid, numeric, uuid, timestamptz, uuid, text, text, text, text) to authenticated;
grant execute on function public.record_packing_quality_event(uuid, public.quality_event_type, numeric, numeric, numeric, numeric, text[], text, text, timestamptz, uuid, text) to authenticated;
grant execute on function public.create_shipment(uuid, jsonb, text, public.market_scope, text, timestamptz, uuid, uuid, text, uuid, text, text, numeric, text, text) to authenticated;
grant execute on function public.consume_feature_usage(uuid, text, numeric, date, date, text, uuid, text, jsonb) to authenticated;
grant execute on function public.get_organization_entitlements(uuid) to authenticated;
grant execute on function public.admin_update_subscription(uuid, public.subscription_plan, public.subscription_status, timestamptz, timestamptz, timestamptz, jsonb) to authenticated;
grant execute on function public.admin_set_usage_counter(uuid, text, date, date, numeric) to authenticated;
grant execute on function public.update_member_access(uuid, uuid, public.app_role, public.app_permission[], boolean) to authenticated;
grant execute on function public.revoke_invitation(uuid, text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'organization_memberships'
  ) then
    alter publication supabase_realtime add table public.organization_memberships;
  end if;
end;
$$;

commit;
