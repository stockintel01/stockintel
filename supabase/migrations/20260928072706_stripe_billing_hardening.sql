begin;

insert into public.plan_prices (plan_id, currency, interval, amount_minor, active)
values
  ('pro', 'USD', 'monthly', 900, true),
  ('enterprise', 'USD', 'monthly', 2700, true)
on conflict (plan_id, currency, interval) do nothing;

create table public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  api_version text,
  status text not null default 'processing'
    check (status in ('processing', 'processed', 'failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  error_message text,
  stripe_created_at timestamptz not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
alter table public.stripe_webhook_events force row level security;

create policy stripe_webhook_events_select on public.stripe_webhook_events
  for select to authenticated
  using (app_private.is_platform_admin());

grant select on public.stripe_webhook_events to authenticated;
revoke insert, update, delete on public.stripe_webhook_events from authenticated;
revoke all on public.stripe_webhook_events from anon;
grant select, insert, update, delete on public.stripe_webhook_events to service_role;

create or replace function public.claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_api_version text,
  p_stripe_created_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  insert into public.stripe_webhook_events (
    event_id, event_type, api_version, status, stripe_created_at
  ) values (
    p_event_id, p_event_type, p_api_version, 'processing', p_stripe_created_at
  )
  on conflict (event_id) do update
    set status = 'processing',
        attempt_count = public.stripe_webhook_events.attempt_count + 1,
        error_message = null,
        updated_at = now()
    where public.stripe_webhook_events.status = 'failed'
       or (
         public.stripe_webhook_events.status = 'processing'
         and public.stripe_webhook_events.updated_at < now() - interval '10 minutes'
       )
  returning status into v_status;

  if v_status is not null then return 'claimed'; end if;
  select status into v_status from public.stripe_webhook_events where event_id = p_event_id;
  return coalesce(v_status, 'busy');
end;
$$;

create or replace function public.complete_stripe_webhook_event(
  p_event_id text,
  p_succeeded boolean,
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.stripe_webhook_events
  set status = case when p_succeeded then 'processed' else 'failed' end,
      processed_at = case when p_succeeded then now() else null end,
      error_message = case when p_succeeded then null else left(coalesce(p_error_message, 'Unknown webhook failure'), 1000) end,
      updated_at = now()
  where event_id = p_event_id;
end;
$$;

revoke all on function public.claim_stripe_webhook_event(text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.complete_stripe_webhook_event(text, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_stripe_webhook_event(text, text, text, timestamptz) to service_role;
grant execute on function public.complete_stripe_webhook_event(text, boolean, text) to service_role;

commit;
