begin;

create table public.work_shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text not null,
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'on_duty', 'completed', 'cancelled')),
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  foreign key (organization_id, user_id)
    references public.organization_memberships(organization_id, user_id) on delete cascade,
  check (end_time <> start_time)
);

create index work_shifts_schedule_idx
  on public.work_shifts (organization_id, shift_date, start_time, user_id);

create trigger touch_work_shifts
  before update on public.work_shifts
  for each row execute function app_private.touch_updated_at_revision();

alter table public.work_shifts enable row level security;
alter table public.work_shifts force row level security;

create policy work_shifts_select on public.work_shifts
  for select to authenticated
  using (
    app_private.has_any_permission(
      organization_id,
      array['team'::public.app_permission, 'agricPacking'::public.app_permission]
    )
  );

create policy work_shifts_insert on public.work_shifts
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and app_private.subscription_is_active(organization_id)
    and app_private.has_any_permission(organization_id, array['team'::public.app_permission])
  );

create policy work_shifts_update on public.work_shifts
  for update to authenticated
  using (
    app_private.subscription_is_active(organization_id)
    and app_private.has_any_permission(organization_id, array['team'::public.app_permission])
  )
  with check (
    app_private.subscription_is_active(organization_id)
    and app_private.has_any_permission(organization_id, array['team'::public.app_permission])
  );

create policy work_shifts_delete on public.work_shifts
  for delete to authenticated
  using (
    app_private.subscription_is_active(organization_id)
    and app_private.has_any_permission(organization_id, array['team'::public.app_permission])
  );

grant select, insert, update, delete on public.work_shifts to authenticated;
revoke all on public.work_shifts from anon;

do $$
declare
  publication_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach publication_table in array array['work_shifts', 'organization_memberships'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = publication_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', publication_table);
    end if;
  end loop;
end;
$$;

alter table public.work_shifts replica identity full;
alter table public.organization_memberships replica identity full;

commit;
