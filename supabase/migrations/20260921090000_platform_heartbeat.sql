begin;

-- A free Supabase project pauses after about a week without requests. Nothing in the
-- application calls Supabase while Firebase is the active backend, so the project sees
-- no traffic at all and goes idle.
--
-- A scheduled heartbeat is a real database write, which both keeps the project active
-- and records when it was last reached, so a pause is visible before it happens.

create or replace function public.record_platform_heartbeat(p_source text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value jsonb;
begin
  if coalesce(p_source, '') !~ '^[a-z][a-z0-9_-]{1,40}$' then
    raise exception 'A heartbeat source is required.' using errcode = '22023';
  end if;

  v_value := jsonb_build_object('at', to_jsonb(now()), 'source', p_source);

  insert into public.platform_settings (key, value, description)
  values ('heartbeat:' || p_source, v_value, 'Last time ' || p_source || ' reached the database.')
  on conflict (key) do update
    set value = excluded.value,
        updated_at = now();

  return v_value;
end;
$$;

create or replace function public.platform_heartbeats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(replace(setting.key, 'heartbeat:', ''), setting.value),
    '{}'::jsonb
  )
  from public.platform_settings setting
  where setting.key like 'heartbeat:%'
$$;

revoke all on function public.record_platform_heartbeat(text) from public, anon, authenticated;
revoke all on function public.platform_heartbeats() from public, anon, authenticated;

grant execute on function public.record_platform_heartbeat(text) to service_role;
grant execute on function public.platform_heartbeats() to service_role;

commit;
