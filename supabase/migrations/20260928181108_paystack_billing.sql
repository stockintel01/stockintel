begin;

alter table public.plan_prices
  add column if not exists paystack_plan_code text;

create unique index if not exists plan_prices_paystack_plan_code_key
  on public.plan_prices (paystack_plan_code)
  where paystack_plan_code is not null;

insert into public.plan_prices (plan_id, currency, interval, amount_minor, active)
values
  ('pro', 'GHS', 'monthly', 900, true),
  ('enterprise', 'GHS', 'monthly', 2700, true)
on conflict (plan_id, currency, interval) do nothing;

create table public.paystack_checkout_transactions (
  reference text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  plan_id public.subscription_plan not null references public.plans(id),
  plan_code text not null,
  customer_email extensions.citext not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null check (currency = upper(currency)),
  status text not null default 'initialized'
    check (status in ('initialized', 'succeeded', 'failed', 'reversed')),
  terms_version text not null,
  terms_accepted_at timestamptz not null,
  provider_transaction_id text,
  provider_customer_code text,
  provider_subscription_code text,
  paid_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index paystack_checkout_transactions_org_created_idx
  on public.paystack_checkout_transactions (organization_id, created_at desc);
create index paystack_checkout_transactions_customer_plan_idx
  on public.paystack_checkout_transactions (customer_email, plan_code, created_at desc);
create unique index paystack_checkout_transactions_provider_id_key
  on public.paystack_checkout_transactions (provider_transaction_id)
  where provider_transaction_id is not null;

create table public.paystack_subscription_secrets (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  subscription_code text not null unique,
  email_token text not null,
  customer_code text,
  plan_id public.subscription_plan not null references public.plans(id),
  plan_code text not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null check (currency = upper(currency)),
  updated_at timestamptz not null default now()
);

create table public.paystack_webhook_events (
  event_key text primary key,
  event_type text not null,
  payload_hash text not null,
  status text not null default 'processing'
    check (status in ('processing', 'processed', 'failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.paystack_checkout_transactions enable row level security;
alter table public.paystack_checkout_transactions force row level security;
alter table public.paystack_subscription_secrets enable row level security;
alter table public.paystack_subscription_secrets force row level security;
alter table public.paystack_webhook_events enable row level security;
alter table public.paystack_webhook_events force row level security;

create policy paystack_checkout_transactions_admin_read on public.paystack_checkout_transactions
  for select to authenticated using (app_private.is_platform_admin());
create policy paystack_webhook_events_admin_read on public.paystack_webhook_events
  for select to authenticated using (app_private.is_platform_admin());

grant select on public.paystack_checkout_transactions, public.paystack_webhook_events to authenticated;
revoke insert, update, delete on public.paystack_checkout_transactions, public.paystack_webhook_events from authenticated;
revoke all on public.paystack_subscription_secrets from anon, authenticated;
revoke all on public.paystack_checkout_transactions, public.paystack_webhook_events from anon;
grant select, insert, update, delete on public.paystack_checkout_transactions, public.paystack_subscription_secrets, public.paystack_webhook_events to service_role;

create or replace function public.claim_paystack_webhook_event(
  p_event_key text,
  p_event_type text,
  p_payload_hash text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  insert into public.paystack_webhook_events (event_key, event_type, payload_hash)
  values (p_event_key, p_event_type, p_payload_hash)
  on conflict (event_key) do update
    set status = 'processing',
        attempt_count = public.paystack_webhook_events.attempt_count + 1,
        error_message = null,
        updated_at = now()
    where public.paystack_webhook_events.status = 'failed'
       or (
         public.paystack_webhook_events.status = 'processing'
         and public.paystack_webhook_events.updated_at < now() - interval '10 minutes'
       )
  returning status into v_status;

  if v_status is not null then return 'claimed'; end if;
  select status into v_status from public.paystack_webhook_events where event_key = p_event_key;
  return coalesce(v_status, 'busy');
end;
$$;

create or replace function public.complete_paystack_webhook_event(
  p_event_key text,
  p_succeeded boolean,
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.paystack_webhook_events
  set status = case when p_succeeded then 'processed' else 'failed' end,
      processed_at = case when p_succeeded then now() else null end,
      error_message = case when p_succeeded then null else left(coalesce(p_error_message, 'Unknown webhook failure'), 1000) end,
      updated_at = now()
  where event_key = p_event_key;
end;
$$;

create or replace function public.activate_paystack_checkout(
  p_reference text,
  p_transaction_id text,
  p_amount_minor bigint,
  p_currency text,
  p_customer_code text default null,
  p_subscription_code text default null,
  p_email_token text default null,
  p_paid_at timestamptz default now(),
  p_next_payment_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checkout public.paystack_checkout_transactions%rowtype;
  v_period_end timestamptz;
begin
  select * into v_checkout
  from public.paystack_checkout_transactions
  where reference = p_reference
  for update;

  if not found then raise exception 'Unknown Paystack transaction reference'; end if;
  if v_checkout.amount_minor <> p_amount_minor then raise exception 'Paystack amount does not match checkout'; end if;
  if v_checkout.currency <> upper(p_currency) then raise exception 'Paystack currency does not match checkout'; end if;
  if v_checkout.status = 'succeeded' then
    if v_checkout.provider_transaction_id <> p_transaction_id then
      raise exception 'Checkout reference was already fulfilled by a different transaction';
    end if;
    return jsonb_build_object('organization_id', v_checkout.organization_id, 'plan_id', v_checkout.plan_id, 'duplicate', true);
  end if;
  if v_checkout.status = 'reversed' then
    raise exception 'This payment was refunded and cannot reactivate the subscription';
  end if;

  v_period_end := coalesce(p_next_payment_at, p_paid_at + interval '1 month');
  update public.paystack_checkout_transactions
  set status = 'succeeded',
      provider_transaction_id = p_transaction_id,
      provider_customer_code = coalesce(p_customer_code, provider_customer_code),
      provider_subscription_code = coalesce(p_subscription_code, provider_subscription_code),
      paid_at = p_paid_at,
      failure_reason = null,
      updated_at = now()
  where reference = p_reference;

  insert into public.organization_subscriptions (
    organization_id, plan_id, status, provider, provider_customer_id,
    provider_subscription_id, current_period_start, current_period_end,
    cancel_at_period_end, updated_at
  ) values (
    v_checkout.organization_id, v_checkout.plan_id, 'active', 'paystack', p_customer_code,
    p_subscription_code, p_paid_at, v_period_end, false, now()
  )
  on conflict (organization_id) do update
    set plan_id = excluded.plan_id,
        status = 'active',
        provider = 'paystack',
        provider_customer_id = coalesce(excluded.provider_customer_id, public.organization_subscriptions.provider_customer_id),
        provider_subscription_id = coalesce(excluded.provider_subscription_id, public.organization_subscriptions.provider_subscription_id),
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = false,
        updated_at = now();

  if p_subscription_code is not null and p_email_token is not null then
    insert into public.paystack_subscription_secrets (
      organization_id, subscription_code, email_token, customer_code, plan_id, plan_code, amount_minor, currency
    ) values (
      v_checkout.organization_id, p_subscription_code, p_email_token, p_customer_code,
      v_checkout.plan_id, v_checkout.plan_code, v_checkout.amount_minor, v_checkout.currency
    )
    on conflict (organization_id) do update
      set subscription_code = excluded.subscription_code,
          email_token = excluded.email_token,
          customer_code = coalesce(excluded.customer_code, public.paystack_subscription_secrets.customer_code),
          plan_id = excluded.plan_id,
          plan_code = excluded.plan_code,
          amount_minor = excluded.amount_minor,
          currency = excluded.currency,
          updated_at = now();
  end if;

  return jsonb_build_object('organization_id', v_checkout.organization_id, 'plan_id', v_checkout.plan_id, 'duplicate', false);
end;
$$;

create or replace function public.link_paystack_subscription(
  p_customer_email text,
  p_customer_code text,
  p_plan_code text,
  p_subscription_code text,
  p_email_token text,
  p_next_payment_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checkout public.paystack_checkout_transactions%rowtype;
begin
  select * into v_checkout
  from public.paystack_checkout_transactions
  where lower(customer_email::text) = lower(p_customer_email)
    and plan_code = p_plan_code
    and status in ('initialized', 'succeeded')
    and created_at > now() - interval '7 days'
  order by created_at desc
  limit 1
  for update;
  if not found then raise exception 'No matching checkout exists for the Paystack subscription'; end if;

  update public.paystack_checkout_transactions
  set provider_customer_code = coalesce(p_customer_code, provider_customer_code),
      provider_subscription_code = p_subscription_code,
      updated_at = now()
  where reference = v_checkout.reference;

  insert into public.paystack_subscription_secrets (
    organization_id, subscription_code, email_token, customer_code, plan_id, plan_code, amount_minor, currency
  ) values (
    v_checkout.organization_id, p_subscription_code, p_email_token, p_customer_code,
    v_checkout.plan_id, p_plan_code, v_checkout.amount_minor, v_checkout.currency
  )
  on conflict (organization_id) do update
    set subscription_code = excluded.subscription_code,
        email_token = excluded.email_token,
        customer_code = coalesce(excluded.customer_code, public.paystack_subscription_secrets.customer_code),
        plan_id = excluded.plan_id,
        plan_code = excluded.plan_code,
        amount_minor = excluded.amount_minor,
        currency = excluded.currency,
        updated_at = now();

  update public.organization_subscriptions
  set provider = 'paystack',
      provider_customer_id = coalesce(p_customer_code, provider_customer_id),
      provider_subscription_id = p_subscription_code,
      current_period_end = coalesce(p_next_payment_at, current_period_end),
      updated_at = now()
  where organization_id = v_checkout.organization_id;

  return v_checkout.organization_id;
end;
$$;

create or replace function public.update_paystack_subscription_status(
  p_subscription_code text,
  p_status public.subscription_status,
  p_period_start timestamptz default null,
  p_period_end timestamptz default null,
  p_cancel_at_period_end boolean default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  select organization_id into v_organization_id
  from public.paystack_subscription_secrets
  where subscription_code = p_subscription_code;
  if v_organization_id is null then raise exception 'Unknown Paystack subscription'; end if;

  update public.organization_subscriptions
  set status = p_status,
      current_period_start = coalesce(p_period_start, current_period_start),
      current_period_end = coalesce(p_period_end, current_period_end),
      cancel_at_period_end = coalesce(p_cancel_at_period_end, cancel_at_period_end),
      provider = 'paystack',
      updated_at = now()
  where organization_id = v_organization_id;
  return v_organization_id;
end;
$$;

revoke all on function public.claim_paystack_webhook_event(text, text, text) from public, anon, authenticated;
revoke all on function public.complete_paystack_webhook_event(text, boolean, text) from public, anon, authenticated;
revoke all on function public.activate_paystack_checkout(text, text, bigint, text, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.link_paystack_subscription(text, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.update_paystack_subscription_status(text, public.subscription_status, timestamptz, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.claim_paystack_webhook_event(text, text, text) to service_role;
grant execute on function public.complete_paystack_webhook_event(text, boolean, text) to service_role;
grant execute on function public.activate_paystack_checkout(text, text, bigint, text, text, text, text, timestamptz, timestamptz) to service_role;
grant execute on function public.link_paystack_subscription(text, text, text, text, text, timestamptz) to service_role;
grant execute on function public.update_paystack_subscription_status(text, public.subscription_status, timestamptz, timestamptz, boolean) to service_role;

commit;
