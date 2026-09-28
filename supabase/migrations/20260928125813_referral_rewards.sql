begin;

create table public.referral_credits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  referred_organization_id uuid not null references public.organizations(id) on delete cascade,
  amount_months integer not null check (amount_months between 1 and 24),
  reason text not null check (reason in ('signup_referral', 'upgrade_referral')),
  status text not null default 'available' check (status in ('pending', 'available', 'used')),
  activated_at timestamptz,
  activated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (referred_organization_id, reason),
  check ((status = 'used') = (activated_at is not null and activated_by is not null))
);

alter table public.referral_credits enable row level security;
alter table public.referral_credits force row level security;
create policy referral_credits_select on public.referral_credits for select to authenticated
using (app_private.can_manage_org(organization_id));
revoke insert, update, delete on public.referral_credits from authenticated;

create or replace function app_private.award_signup_referral()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referrer_id uuid;
begin
  if nullif(btrim(new.settings ->> 'referredByCode'), '') is null then return new; end if;
  select organization.id into v_referrer_id from public.organizations organization
  where upper(organization.referral_code) = upper(btrim(new.settings ->> 'referredByCode'))
    and organization.id <> new.id;
  if v_referrer_id is not null then
    insert into public.referral_credits (organization_id, referred_organization_id, amount_months, reason, status)
    values (v_referrer_id, new.id, 1, 'signup_referral', 'available') on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger award_signup_referral_after_organization
after insert on public.organizations for each row execute function app_private.award_signup_referral();

create or replace function app_private.award_upgrade_referral()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referrer_id uuid;
begin
  if new.plan_id not in ('pro', 'enterprise') or new.status <> 'active'
    or (old.plan_id in ('pro', 'enterprise') and old.status = 'active') then return new; end if;
  select referrer.id into v_referrer_id
  from public.organizations upgraded
  join public.organizations referrer
    on upper(referrer.referral_code) = upper(btrim(upgraded.settings ->> 'referredByCode'))
  where upgraded.id = new.organization_id and referrer.id <> upgraded.id;
  if v_referrer_id is not null then
    insert into public.referral_credits (organization_id, referred_organization_id, amount_months, reason, status)
    values (v_referrer_id, new.organization_id, 1, 'upgrade_referral', 'available') on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger award_upgrade_referral_after_subscription
after update of plan_id, status on public.organization_subscriptions
for each row execute function app_private.award_upgrade_referral();

create or replace function public.activate_referral_credit(p_credit_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credit public.referral_credits%rowtype;
  v_subscription public.organization_subscriptions%rowtype;
  v_period_end timestamptz;
begin
  select * into v_credit from public.referral_credits where id = p_credit_id for update;
  if not found then raise exception 'Referral credit not found.' using errcode = 'P0002'; end if;
  if not app_private.can_manage_org(v_credit.organization_id) then
    raise exception 'Only an owner or manager can activate referral credit.' using errcode = '42501';
  end if;
  if v_credit.status <> 'available' then raise exception 'This referral credit is not available.' using errcode = '23514'; end if;
  select * into v_subscription from public.organization_subscriptions
  where organization_id = v_credit.organization_id for update;
  if not found then raise exception 'Subscription not found.' using errcode = 'P0002'; end if;
  v_period_end := greatest(coalesce(v_subscription.current_period_end, v_subscription.trial_ends_at, now()), now())
    + make_interval(months => v_credit.amount_months);
  update public.organization_subscriptions
  set current_period_end = v_period_end,
      trial_ends_at = case when plan_id = 'free_trial' then v_period_end else trial_ends_at end,
      status = case when plan_id = 'free_trial' then 'trialing'::public.subscription_status else 'active'::public.subscription_status end
  where organization_id = v_credit.organization_id;
  update public.referral_credits
  set status = 'used', activated_at = now(), activated_by = (select auth.uid())
  where id = v_credit.id;
  return v_period_end;
end;
$$;

revoke all on function app_private.award_signup_referral() from public, anon, authenticated;
revoke all on function app_private.award_upgrade_referral() from public, anon, authenticated;
revoke all on function public.activate_referral_credit(uuid) from public, anon;
grant execute on function public.activate_referral_credit(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'referral_credits') then
    alter publication supabase_realtime add table public.referral_credits;
  end if;
end;
$$;

commit;
