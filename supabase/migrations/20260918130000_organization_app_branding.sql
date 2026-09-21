begin;

-- Every farm installs its own app: its own name on the home screen, its own colours
-- and icon, and its own start URL. The settings live on the organization so they are
-- covered by the same tenant isolation as the rest of its record.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'organizations' and column_name = 'app_branding'
  ) then
    alter table public.organizations add column app_branding jsonb not null default '{}'::jsonb;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'organizations_app_branding_object'
  ) then
    alter table public.organizations
      add constraint organizations_app_branding_object check (jsonb_typeof(app_branding) = 'object');
  end if;
end;
$$;

-- The manifest is fetched by the browser without a session, so the server reads it
-- with the service role and returns only what appears on a home screen.
create or replace function public.organization_app_branding(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('name', organization.name, 'appBranding', organization.app_branding)
  from public.organizations organization
  where organization.id = p_organization_id
    and organization.archived_at is null
$$;

create or replace function public.set_organization_app_branding(p_organization_id uuid, p_branding jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branding jsonb;
begin
  if p_branding is null or jsonb_typeof(p_branding) <> 'object' then
    raise exception 'App branding must be an object.' using errcode = '22023';
  end if;

  update public.organizations
  set app_branding = p_branding
  where id = p_organization_id
    and archived_at is null
  returning app_branding into v_branding;

  if not found then
    raise exception 'That farm no longer exists.' using errcode = 'P0002';
  end if;
  return v_branding;
end;
$$;

revoke all on function public.organization_app_branding(uuid) from public, anon, authenticated;
revoke all on function public.set_organization_app_branding(uuid, jsonb) from public, anon, authenticated;

grant execute on function public.organization_app_branding(uuid) to service_role;
grant execute on function public.set_organization_app_branding(uuid, jsonb) to service_role;

commit;
