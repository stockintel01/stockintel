begin;

create or replace function app_private.initialize_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trial_days integer := 14;
  v_trial_end timestamptz;
  v_configured_duration text;
begin
  select value #>> '{subscriptionPricing,freeTrial,durationDays}'
    into v_configured_duration
  from public.platform_settings
  where key = 'system_config';

  if coalesce(v_configured_duration, '') ~ '^\d+$' then
    v_trial_days := greatest(1, least(365, v_configured_duration::integer));
  end if;
  v_trial_end := now() + make_interval(days => v_trial_days);

  insert into public.organization_memberships (organization_id, user_id, role, permissions)
  values (new.id, new.owner_id, 'owner', array[]::public.app_permission[])
  on conflict (organization_id, user_id) do update
    set role = 'owner', active = true, updated_at = now();

  insert into public.farm_profiles (organization_id)
  values (new.id)
  on conflict (organization_id) do nothing;

  insert into public.sigatoka_settings (organization_id)
  values (new.id)
  on conflict (organization_id) do nothing;

  insert into public.organization_subscriptions (
    organization_id, plan_id, status, provider, trial_ends_at, current_period_start, current_period_end
  )
  values (
    new.id, 'free_trial', 'trialing', 'internal', v_trial_end, now(), v_trial_end
  )
  on conflict (organization_id) do nothing;

  update public.profiles
  set default_organization_id = coalesce(default_organization_id, new.id), updated_at = now()
  where id = new.owner_id;

  return new;
end;
$$;

commit;
