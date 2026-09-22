begin;

-- Firestore denormalises the author's name onto every expense, request, issue and
-- checkout document, so each member sees who did what. Postgres keeps names in
-- public.profiles, and profiles_select exposes only the caller's own row plus the
-- rows of workspaces they manage. Without this a worker reading the expense ledger
-- sees amounts with nobody against them, and so does every other ported screen that
-- shows a person.
--
-- It returns what those screens already display today and nothing more: no email
-- address, no last-seen time, no membership of any other workspace. Callers must be
-- a member of the workspace they ask about.
create or replace function public.organization_member_directory(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_members jsonb;
begin
  if p_organization_id is null or not app_private.is_org_member(p_organization_id) then
    raise exception 'You do not have access to that farm.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', membership.user_id,
    'displayName', profile.display_name,
    'photoUrl', profile.photo_url,
    'role', membership.role,
    'active', membership.active
  ) order by profile.display_name), '[]'::jsonb)
  into v_members
  from public.organization_memberships membership
  join public.profiles profile on profile.id = membership.user_id
  where membership.organization_id = p_organization_id;

  return v_members;
end;
$$;

revoke all on function public.organization_member_directory(uuid) from public, anon, authenticated;
grant execute on function public.organization_member_directory(uuid) to authenticated, service_role;

commit;
