begin;

-- Communication layer: sender identities, verified contacts with recorded consent,
-- a durable event and message queue, and delivery tracking. Server code reaches
-- these tables with the service role; clients only get RLS-scoped reads.

-- ---------------------------------------------------------------------------
-- Sender identities
-- ---------------------------------------------------------------------------

create table public.channel_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  channel text not null check (channel in ('whatsapp')),
  provider text not null check (provider in ('meta_cloud')),
  ownership text not null check (ownership in ('platform', 'tenant')),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  display_phone_number text check (display_phone_number is null or display_phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  provider_account_id text not null check (char_length(btrim(provider_account_id)) between 1 and 64),
  provider_sender_id text not null check (char_length(btrim(provider_sender_id)) between 1 and 64),
  secret_ref text not null check (secret_ref ~ '^(env|vault):[A-Za-z0-9_.:-]{1,120}$'),
  status text not null default 'active' check (status in ('active', 'disabled', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  check ((ownership = 'platform') = (organization_id is null)),
  unique (channel, provider_sender_id)
);

create unique index channel_connections_platform_idx
  on public.channel_connections (channel)
  where ownership = 'platform' and status = 'active';
create unique index channel_connections_tenant_idx
  on public.channel_connections (organization_id, channel)
  where ownership = 'tenant' and status = 'active';
create index channel_connections_organization_idx on public.channel_connections (organization_id);
create index channel_connections_account_idx on public.channel_connections (provider_account_id);

-- ---------------------------------------------------------------------------
-- Contacts, consent, and link codes
-- ---------------------------------------------------------------------------

create table public.contact_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel text not null check (channel in ('whatsapp')),
  address text not null check (address ~ '^\+[1-9][0-9]{7,14}$'),
  profile_id uuid references public.profiles(id) on delete cascade,
  firebase_uid text check (firebase_uid is null or char_length(firebase_uid) between 1 and 128),
  display_name text check (display_name is null or char_length(display_name) <= 160),
  status text not null default 'active' check (status in ('active', 'unreachable', 'revoked')),
  verified_at timestamptz not null,
  verification_method text not null check (verification_method in ('inbound_link_code')),
  last_inbound_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text check (
    revoked_reason is null
    or revoked_reason in ('member_request', 'relinked', 'membership_inactive', 'administrator')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  check (profile_id is not null or firebase_uid is not null),
  check ((status = 'revoked') = (revoked_at is not null)),
  unique (id, organization_id)
);

-- One live number per member per organization, and one member per live number.
create unique index contact_channels_address_idx
  on public.contact_channels (organization_id, channel, address)
  where status <> 'revoked';
create unique index contact_channels_profile_idx
  on public.contact_channels (organization_id, channel, profile_id)
  where profile_id is not null and status <> 'revoked';
create unique index contact_channels_firebase_idx
  on public.contact_channels (organization_id, channel, firebase_uid)
  where firebase_uid is not null and status <> 'revoked';
create index contact_channels_organization_idx on public.contact_channels (organization_id, status);
create index contact_channels_profile_lookup_idx on public.contact_channels (profile_id);
create index contact_channels_address_lookup_idx on public.contact_channels (channel, address);

create table public.communication_consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_channel_id uuid not null,
  category text not null check (category in ('operational')),
  granted_at timestamptz not null,
  grant_source text not null check (grant_source in ('whatsapp_link_code', 'whatsapp_keyword')),
  grant_evidence text check (grant_evidence is null or char_length(grant_evidence) <= 200),
  revoked_at timestamptz,
  revoke_source text check (
    revoke_source is null
    or revoke_source in ('whatsapp_keyword', 'member_request', 'relinked', 'membership_inactive', 'administrator')
  ),
  revoke_evidence text check (revoke_evidence is null or char_length(revoke_evidence) <= 200),
  created_at timestamptz not null default now(),
  foreign key (contact_channel_id, organization_id)
    references public.contact_channels(id, organization_id) on delete cascade,
  check ((revoked_at is null) = (revoke_source is null))
);

create unique index communication_consents_active_idx
  on public.communication_consents (contact_channel_id, category)
  where revoked_at is null;
create index communication_consents_contact_idx
  on public.communication_consents (contact_channel_id, organization_id);
create index communication_consents_organization_idx on public.communication_consents (organization_id);

create table public.contact_link_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel text not null check (channel in ('whatsapp')),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  profile_id uuid references public.profiles(id) on delete cascade,
  firebase_uid text check (firebase_uid is null or char_length(firebase_uid) between 1 and 128),
  display_name text check (display_name is null or char_length(display_name) <= 160),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_contact_channel_id uuid references public.contact_channels(id) on delete set null,
  created_at timestamptz not null default now(),
  check (profile_id is not null or firebase_uid is not null),
  check (expires_at > created_at)
);

create index contact_link_codes_organization_idx on public.contact_link_codes (organization_id, created_at desc);
create index contact_link_codes_firebase_idx on public.contact_link_codes (organization_id, firebase_uid, created_at desc);
create index contact_link_codes_profile_idx on public.contact_link_codes (profile_id);
create index contact_link_codes_contact_idx on public.contact_link_codes (consumed_contact_channel_id);

-- ---------------------------------------------------------------------------
-- Templates and rules
-- ---------------------------------------------------------------------------

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  channel text not null check (channel in ('whatsapp')),
  template_key text not null check (template_key ~ '^[a-z][a-z0-9_]{2,63}$'),
  provider_template_name text not null check (provider_template_name ~ '^[a-z0-9_]{1,512}$'),
  language_code text not null check (language_code ~ '^[a-z]{2,3}(_[A-Z]{2})?$'),
  -- Marketing templates are deliberately impossible to register.
  category text not null check (category in ('utility', 'authentication')),
  body_parameters text[] not null default array[]::text[],
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'paused', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index message_templates_platform_idx
  on public.message_templates (channel, template_key, language_code)
  where organization_id is null;
create unique index message_templates_tenant_idx
  on public.message_templates (organization_id, channel, template_key, language_code)
  where organization_id is not null;
create index message_templates_organization_idx on public.message_templates (organization_id);

create table public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  channel text not null check (channel in ('whatsapp')),
  enabled boolean not null default true,
  audience jsonb not null default '{}'::jsonb check (jsonb_typeof(audience) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  unique (organization_id, event_type, channel)
);

-- ---------------------------------------------------------------------------
-- Event and message queues
-- ---------------------------------------------------------------------------

create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  source_type text check (source_type is null or char_length(source_type) <= 80),
  source_id text check (source_id is null or char_length(source_id) <= 200),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 300),
  status text not null default 'pending' check (status in ('pending', 'processing', 'processed', 'skipped', 'failed')),
  status_reason text check (status_reason is null or char_length(status_reason) <= 200),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  occurred_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  unique (id, organization_id)
);

create index notification_events_queue_idx
  on public.notification_events (next_attempt_at)
  where status in ('pending', 'processing');

-- Tracks condition-based alerts (such as an item being below minimum) so a
-- condition notifies once when it starts rather than on every scan.
create table public.notification_alert_states (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  alert_key text not null check (char_length(alert_key) between 1 and 300),
  active boolean not null,
  episode_started_at timestamptz,
  last_observed_at timestamptz not null default now(),
  resolved_at timestamptz,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (organization_id, alert_key),
  check (not active or episode_started_at is not null)
);

create table public.message_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid,
  connection_id uuid not null references public.channel_connections(id),
  contact_channel_id uuid not null,
  template_id uuid references public.message_templates(id),
  channel text not null check (channel in ('whatsapp')),
  message_kind text not null check (message_kind in ('template', 'text')),
  recipient_address text not null check (recipient_address ~ '^\+[1-9][0-9]{7,14}$'),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 300),
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'suppressed')),
  status_reason text check (status_reason is null or char_length(status_reason) <= 200),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  provider_message_id text,
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 40),
  last_error_message text check (last_error_message is null or char_length(last_error_message) <= 500),
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '180 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, organization_id) references public.notification_events(id, organization_id),
  foreign key (contact_channel_id, organization_id) references public.contact_channels(id, organization_id),
  unique (organization_id, idempotency_key),
  unique (id, organization_id),
  check (message_kind <> 'template' or template_id is not null)
);

create unique index message_outbox_provider_message_idx
  on public.message_outbox (provider_message_id)
  where provider_message_id is not null;
create index message_outbox_queue_idx
  on public.message_outbox (next_attempt_at)
  where status in ('queued', 'sending');
create index message_outbox_organization_idx on public.message_outbox (organization_id, queued_at desc);
create index message_outbox_event_idx on public.message_outbox (event_id, organization_id);
create index message_outbox_contact_idx on public.message_outbox (contact_channel_id, organization_id);
create index message_outbox_connection_idx on public.message_outbox (connection_id);
create index message_outbox_template_idx on public.message_outbox (template_id);

create table public.message_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  outbox_id uuid not null,
  provider_message_id text not null,
  status text not null check (status in ('sent', 'delivered', 'read', 'failed')),
  provider_timestamp timestamptz not null,
  error_code text check (error_code is null or char_length(error_code) <= 40),
  error_title text check (error_title is null or char_length(error_title) <= 500),
  pricing_category text check (pricing_category is null or char_length(pricing_category) <= 40),
  billable boolean,
  received_at timestamptz not null default now(),
  foreign key (outbox_id, organization_id) references public.message_outbox(id, organization_id) on delete cascade,
  unique (provider_message_id, status, provider_timestamp)
);

create index message_deliveries_outbox_idx on public.message_deliveries (outbox_id, organization_id);
create index message_deliveries_organization_idx on public.message_deliveries (organization_id, received_at desc);

-- Meta retries webhooks; this makes each inbound message take effect once.
create table public.inbound_message_receipts (
  provider_message_id text primary key check (char_length(provider_message_id) between 1 and 200),
  connection_id uuid not null references public.channel_connections(id) on delete cascade,
  received_at timestamptz not null default now()
);

create index inbound_message_receipts_connection_idx
  on public.inbound_message_receipts (connection_id, received_at desc);

-- ---------------------------------------------------------------------------
-- Triggers, row-level security, and grants
-- ---------------------------------------------------------------------------

do $$
declare
  table_name text;
begin
  foreach table_name in array array['channel_connections', 'contact_channels', 'notification_rules'] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function app_private.touch_updated_at_revision()',
      'touch_' || table_name,
      table_name
    );
  end loop;

  foreach table_name in array array['message_templates', 'notification_alert_states', 'message_outbox'] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function app_private.touch_updated_at()',
      'touch_' || table_name,
      table_name
    );
  end loop;

  foreach table_name in array array[
    'channel_connections', 'contact_channels', 'communication_consents', 'contact_link_codes',
    'message_templates', 'notification_rules', 'notification_events', 'notification_alert_states',
    'message_outbox', 'message_deliveries', 'inbound_message_receipts'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end;
$$;

create policy channel_connections_select on public.channel_connections
  for select to authenticated
  using (
    organization_id is not null
    and app_private.has_any_permission(organization_id, array['messagingAdmin']::public.app_permission[])
  );

create policy contact_channels_select on public.contact_channels
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or app_private.has_any_permission(organization_id, array['messagingAdmin']::public.app_permission[])
  );

create policy communication_consents_select on public.communication_consents
  for select to authenticated
  using (
    app_private.has_any_permission(organization_id, array['messagingAdmin']::public.app_permission[])
    or exists (
      select 1
      from public.contact_channels contact
      where contact.id = communication_consents.contact_channel_id
        and contact.profile_id = (select auth.uid())
    )
  );

create policy message_templates_select on public.message_templates
  for select to authenticated
  using (
    organization_id is not null
    and app_private.has_any_permission(organization_id, array['messagingAdmin']::public.app_permission[])
  );

create policy notification_rules_select on public.notification_rules
  for select to authenticated
  using (app_private.is_org_member(organization_id));

create policy notification_events_select on public.notification_events
  for select to authenticated
  using (app_private.has_any_permission(organization_id, array['messagingAdmin']::public.app_permission[]));

create policy message_outbox_select on public.message_outbox
  for select to authenticated
  using (app_private.has_any_permission(organization_id, array['messagingAdmin']::public.app_permission[]));

create policy message_deliveries_select on public.message_deliveries
  for select to authenticated
  using (app_private.has_any_permission(organization_id, array['messagingAdmin']::public.app_permission[]));

-- contact_link_codes, notification_alert_states and inbound_message_receipts carry no
-- policy on purpose: only the service role reads or writes them, and a link code must
-- never be readable by a client. The security advisor reports "RLS enabled, no policy"
-- for those three, which is the intended state rather than a finding to fix.

-- Clients read through the policies above. All writes go through the service role.
grant select on
  public.channel_connections,
  public.contact_channels,
  public.communication_consents,
  public.message_templates,
  public.notification_rules,
  public.notification_events,
  public.message_outbox,
  public.message_deliveries
to authenticated;

grant select, insert, update, delete on
  public.channel_connections,
  public.contact_channels,
  public.communication_consents,
  public.contact_link_codes,
  public.message_templates,
  public.notification_rules,
  public.notification_events,
  public.notification_alert_states,
  public.message_outbox,
  public.message_deliveries,
  public.inbound_message_receipts
to service_role;

-- ---------------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------------

insert into public.message_templates (
  organization_id, channel, template_key, provider_template_name, language_code, category, body_parameters, status
) values (
  null, 'whatsapp', 'inventory_low_stock', 'stockintel_low_stock_alert', 'en', 'utility',
  array['organization_name', 'item_count', 'item_summary'], 'pending'
)
on conflict do nothing;

insert into public.plan_entitlements (plan_id, feature_key, enabled, limit_value)
values
  ('free_trial', 'whatsapp_notifications', false, 0),
  ('free_trial', 'whatsapp_messages', true, 50),
  ('free_trial', 'whatsapp_receipts', false, 0),
  ('free_trial', 'whatsapp_inbound', false, 0),
  ('free_trial', 'whatsapp_own_number', false, 0),
  ('free_trial', 'whatsapp_ai', false, 0),
  ('free_trial', 'whatsapp_campaigns', false, 0),
  ('pro', 'whatsapp_notifications', true, null),
  ('pro', 'whatsapp_messages', true, 1500),
  ('pro', 'whatsapp_receipts', true, null),
  ('pro', 'whatsapp_inbound', true, null),
  ('pro', 'whatsapp_own_number', false, 0),
  ('pro', 'whatsapp_ai', false, 0),
  ('pro', 'whatsapp_campaigns', false, 0),
  ('enterprise', 'whatsapp_notifications', true, null),
  ('enterprise', 'whatsapp_messages', true, null),
  ('enterprise', 'whatsapp_receipts', true, null),
  ('enterprise', 'whatsapp_inbound', true, null),
  ('enterprise', 'whatsapp_own_number', true, null),
  ('enterprise', 'whatsapp_ai', true, null),
  ('enterprise', 'whatsapp_campaigns', false, 0)
on conflict (plan_id, feature_key) do nothing;

-- ---------------------------------------------------------------------------
-- Service functions. Each is callable only by the service role.
-- ---------------------------------------------------------------------------

create or replace function public.comms_sync_platform_connection(
  p_channel text,
  p_provider text,
  p_display_name text,
  p_display_phone_number text,
  p_provider_account_id text,
  p_provider_sender_id text,
  p_secret_ref text
)
returns public.channel_connections
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection public.channel_connections%rowtype;
begin
  update public.channel_connections
  set status = 'disabled'
  where channel = p_channel
    and ownership = 'platform'
    and status = 'active'
    and provider_sender_id <> p_provider_sender_id;

  insert into public.channel_connections (
    organization_id, channel, provider, ownership, display_name, display_phone_number,
    provider_account_id, provider_sender_id, secret_ref, status
  ) values (
    null, p_channel, p_provider, 'platform', p_display_name, p_display_phone_number,
    p_provider_account_id, p_provider_sender_id, p_secret_ref, 'active'
  )
  on conflict (channel, provider_sender_id) do update
    set provider = excluded.provider,
        display_name = excluded.display_name,
        display_phone_number = excluded.display_phone_number,
        provider_account_id = excluded.provider_account_id,
        secret_ref = excluded.secret_ref,
        status = 'active'
    where channel_connections.ownership = 'platform'
  returning * into v_connection;

  if not found then
    raise exception 'That sender is already registered to a tenant.' using errcode = '23505';
  end if;
  return v_connection;
end;
$$;

create or replace function public.comms_resolve_legacy_organization(p_legacy_firebase_id text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organization.id
  from public.organizations organization
  where organization.legacy_firebase_id = p_legacy_firebase_id
    and organization.archived_at is null
$$;

create or replace function public.comms_organization_context(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'organizationId', organization.id,
    'name', organization.name,
    'legacyFirebaseId', organization.legacy_firebase_id,
    'timezone', organization.timezone,
    'features', jsonb_build_object(
      'whatsapp_notifications', app_private.feature_is_enabled(organization.id, 'whatsapp_notifications'),
      'whatsapp_messages', app_private.feature_is_enabled(organization.id, 'whatsapp_messages')
    )
  )
  from public.organizations organization
  where organization.id = p_organization_id
    and organization.archived_at is null
$$;

create or replace function public.comms_member_directory(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', membership.user_id,
    'legacyFirebaseUid', profile.legacy_firebase_uid,
    'role', membership.role,
    'permissions', to_jsonb(membership.permissions),
    'displayName', profile.display_name
  ) order by membership.user_id), '[]'::jsonb)
  from public.organization_memberships membership
  left join public.profiles profile on profile.id = membership.user_id
  where membership.organization_id = p_organization_id
    and membership.active
$$;

create or replace function public.comms_inventory_levels(p_organization_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'itemId', item.id,
    'name', item.name,
    'quantity', coalesce(balance.quantity, 0),
    'minimum', item.minimum_stock,
    'unit', coalesce(stock_unit.symbol, stock_unit.code::text)
  ) order by item.name), '[]'::jsonb)
  from public.inventory_items item
  join public.units_of_measure stock_unit on stock_unit.id = item.stock_unit_id
  left join public.inventory_balances balance on balance.item_id = item.id
  where item.organization_id = p_organization_id
    and item.active
    and item.archived_at is null
$$;

-- Mirrors public.consume_feature_usage for callers with no user session, such as
-- the queue worker. The actor is recorded as null.
create or replace function public.consume_feature_usage_system(
  p_organization_id uuid,
  p_feature_key text,
  p_quantity numeric,
  p_idempotency_key text,
  p_enforce_limit boolean,
  p_source_type text default null,
  p_source_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (allowed boolean, usage_total numeric, usage_limit numeric, limit_exceeded boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period_start date := date_trunc('month', current_date)::date;
  v_period_end date := (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date;
  v_limit numeric;
  v_total numeric;
begin
  if p_organization_id is null or coalesce(btrim(p_feature_key), '') = '' then
    raise exception 'Organization and feature are required.' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity <= 0 or coalesce(btrim(p_idempotency_key), '') = '' or p_enforce_limit is null then
    raise exception 'A positive quantity, an idempotency key, and an enforcement mode are required.' using errcode = '22023';
  end if;

  if not app_private.feature_is_enabled(p_organization_id, p_feature_key) then
    return query select false, null::numeric, null::numeric, false;
    return;
  end if;

  perform app_private.lock_feature_quota(p_organization_id, 'usage:' || p_feature_key || ':' || v_period_start::text);
  v_limit := app_private.entitlement_limit(p_organization_id, p_feature_key);

  select counter.quantity into v_total
  from public.usage_period_counters counter
  where counter.organization_id = p_organization_id
    and counter.feature_key = p_feature_key
    and counter.period_start = v_period_start
  for update;
  v_total := coalesce(v_total, 0);

  if exists (
    select 1
    from public.usage_events usage_event
    where usage_event.organization_id = p_organization_id
      and usage_event.idempotency_key = p_idempotency_key
  ) then
    return query select true, v_total, v_limit, v_limit is not null and v_total > v_limit;
    return;
  end if;

  if p_enforce_limit and v_limit is not null and v_total + p_quantity > v_limit then
    return query select false, v_total, v_limit, true;
    return;
  end if;

  insert into public.usage_period_counters (organization_id, feature_key, period_start, period_end, quantity)
  values (p_organization_id, p_feature_key, v_period_start, v_period_end, v_total + p_quantity)
  on conflict (organization_id, feature_key, period_start) do update
    set period_end = excluded.period_end,
        quantity = excluded.quantity,
        updated_at = now();

  insert into public.usage_events (
    organization_id, feature_key, quantity, source_type, source_id, idempotency_key, metadata
  ) values (
    p_organization_id, p_feature_key, p_quantity, nullif(btrim(p_source_type), ''),
    p_source_id, p_idempotency_key, coalesce(p_metadata, '{}'::jsonb)
  );

  v_total := v_total + p_quantity;
  return query select true, v_total, v_limit, v_limit is not null and v_total > v_limit;
end;
$$;

create or replace function public.claim_notification_events(
  p_batch_size integer default 20,
  p_lease_seconds integer default 120,
  p_max_attempts integer default 5
)
returns setof public.notification_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch_size integer := least(greatest(coalesce(p_batch_size, 20), 1), 100);
  v_lease interval := make_interval(secs => least(greatest(coalesce(p_lease_seconds, 120), 30), 900));
  v_max_attempts integer := least(greatest(coalesce(p_max_attempts, 5), 1), 20);
begin
  update public.notification_events
  set status = 'failed',
      status_reason = 'attempts_exhausted',
      lease_expires_at = null,
      processed_at = now()
  where attempts >= v_max_attempts
    and (status = 'pending' or (status = 'processing' and lease_expires_at <= now()));

  return query
  with candidates as (
    select queued_event.id
    from public.notification_events queued_event
    where queued_event.attempts < v_max_attempts
      and (
        (queued_event.status = 'pending' and queued_event.next_attempt_at <= now())
        or (queued_event.status = 'processing' and queued_event.lease_expires_at <= now())
      )
    order by queued_event.next_attempt_at
    limit v_batch_size
    for update skip locked
  ), claimed as (
    update public.notification_events claimed_event
    set status = 'processing',
        attempts = claimed_event.attempts + 1,
        lease_expires_at = now() + v_lease
    from candidates
    where claimed_event.id = candidates.id
    returning claimed_event.*
  )
  select * from claimed;
end;
$$;

create or replace function public.claim_message_outbox(
  p_batch_size integer default 20,
  p_lease_seconds integer default 120,
  p_max_attempts integer default 5
)
returns setof public.message_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch_size integer := least(greatest(coalesce(p_batch_size, 20), 1), 100);
  v_lease interval := make_interval(secs => least(greatest(coalesce(p_lease_seconds, 120), 30), 900));
  v_max_attempts integer := least(greatest(coalesce(p_max_attempts, 5), 1), 20);
begin
  update public.message_outbox
  set status = 'failed',
      status_reason = 'attempts_exhausted',
      failed_at = now(),
      lease_expires_at = null
  where attempts >= v_max_attempts
    and (status = 'queued' or (status = 'sending' and lease_expires_at <= now()));

  return query
  with candidates as (
    select queued_message.id
    from public.message_outbox queued_message
    where queued_message.attempts < v_max_attempts
      and queued_message.expires_at > now()
      and (
        (queued_message.status = 'queued' and queued_message.next_attempt_at <= now())
        or (queued_message.status = 'sending' and queued_message.lease_expires_at <= now())
      )
    order by queued_message.next_attempt_at
    limit v_batch_size
    for update skip locked
  ), claimed as (
    update public.message_outbox claimed_message
    set status = 'sending',
        attempts = claimed_message.attempts + 1,
        lease_expires_at = now() + v_lease
    from candidates
    where claimed_message.id = candidates.id
    returning claimed_message.*
  )
  select * from claimed;
end;
$$;

-- Binds the WhatsApp number that sent a valid link code to the member who created
-- the code. The inbound message proves the member controls the number and is the
-- opt-in evidence.
create or replace function public.comms_link_contact_channel(
  p_code_hash text,
  p_address text,
  p_connection_id uuid,
  p_provider_message_id text,
  p_received_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code public.contact_link_codes%rowtype;
  v_connection public.channel_connections%rowtype;
  v_organization_name text;
  v_contact_id uuid;
begin
  if coalesce(p_code_hash, '') !~ '^[0-9a-f]{64}$' or coalesce(p_address, '') !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'A link code hash and an E.164 address are required.' using errcode = '22023';
  end if;

  select * into v_connection
  from public.channel_connections sender
  where sender.id = p_connection_id
    and sender.status = 'active';
  if not found then
    return jsonb_build_object('outcome', 'unknown_connection');
  end if;

  select * into v_code
  from public.contact_link_codes link_code
  where link_code.code_hash = p_code_hash
  for update;
  if not found then
    return jsonb_build_object('outcome', 'invalid_code');
  end if;
  if v_code.consumed_at is not null then
    return jsonb_build_object('outcome', 'already_used');
  end if;
  if v_code.expires_at <= now() then
    return jsonb_build_object('outcome', 'expired');
  end if;

  -- A tenant with its own number must link through that number, not the platform's.
  if (v_connection.ownership = 'tenant' and v_connection.organization_id <> v_code.organization_id)
    or (v_connection.ownership = 'platform' and exists (
      select 1
      from public.channel_connections tenant_connection
      where tenant_connection.organization_id = v_code.organization_id
        and tenant_connection.channel = v_code.channel
        and tenant_connection.ownership = 'tenant'
        and tenant_connection.status = 'active'
    )) then
    return jsonb_build_object('outcome', 'wrong_number');
  end if;

  select organization.name into v_organization_name
  from public.organizations organization
  where organization.id = v_code.organization_id
    and organization.archived_at is null;
  if not found then
    return jsonb_build_object('outcome', 'invalid_code');
  end if;

  if exists (
    select 1
    from public.contact_channels contact
    where contact.organization_id = v_code.organization_id
      and contact.channel = v_code.channel
      and contact.address = p_address
      and contact.status <> 'revoked'
      and not (
        (v_code.profile_id is not null and contact.profile_id = v_code.profile_id)
        or (v_code.firebase_uid is not null and contact.firebase_uid = v_code.firebase_uid)
      )
  ) then
    return jsonb_build_object('outcome', 'address_in_use', 'organizationName', v_organization_name);
  end if;

  update public.communication_consents
  set revoked_at = now(),
      revoke_source = 'relinked',
      revoke_evidence = p_provider_message_id
  where revoked_at is null
    and contact_channel_id in (
      select contact.id
      from public.contact_channels contact
      where contact.organization_id = v_code.organization_id
        and contact.channel = v_code.channel
        and contact.status <> 'revoked'
        and (
          (v_code.profile_id is not null and contact.profile_id = v_code.profile_id)
          or (v_code.firebase_uid is not null and contact.firebase_uid = v_code.firebase_uid)
        )
    );

  update public.contact_channels contact
  set status = 'revoked',
      revoked_at = now(),
      revoked_reason = 'relinked'
  where contact.organization_id = v_code.organization_id
    and contact.channel = v_code.channel
    and contact.status <> 'revoked'
    and (
      (v_code.profile_id is not null and contact.profile_id = v_code.profile_id)
      or (v_code.firebase_uid is not null and contact.firebase_uid = v_code.firebase_uid)
    );

  insert into public.contact_channels (
    organization_id, channel, address, profile_id, firebase_uid, display_name,
    status, verified_at, verification_method, last_inbound_at
  ) values (
    v_code.organization_id, v_code.channel, p_address, v_code.profile_id, v_code.firebase_uid,
    v_code.display_name, 'active', p_received_at, 'inbound_link_code', p_received_at
  )
  returning id into v_contact_id;

  insert into public.communication_consents (
    organization_id, contact_channel_id, category, granted_at, grant_source, grant_evidence
  ) values (
    v_code.organization_id, v_contact_id, 'operational', p_received_at, 'whatsapp_link_code', p_provider_message_id
  );

  update public.contact_link_codes
  set consumed_at = now(),
      consumed_contact_channel_id = v_contact_id
  where id = v_code.id;

  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, new_record)
  values (
    v_code.organization_id, v_code.profile_id, 'contact.linked', 'contact_channels', v_contact_id::text,
    jsonb_build_object(
      'channel', v_code.channel,
      'firebaseUid', v_code.firebase_uid,
      'connectionId', p_connection_id,
      'consentCategory', 'operational',
      'evidence', p_provider_message_id
    )
  );

  return jsonb_build_object(
    'outcome', 'linked',
    'organizationId', v_code.organization_id,
    'organizationName', v_organization_name,
    'contactChannelId', v_contact_id,
    'displayName', v_code.display_name
  );
end;
$$;

-- STOP and START keywords. On the shared platform number the sender cannot target
-- one farm, so a keyword applies to every organization that sends through it.
create or replace function public.comms_set_keyword_consent(
  p_connection_id uuid,
  p_address text,
  p_granted boolean,
  p_provider_message_id text,
  p_received_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection public.channel_connections%rowtype;
  v_contact record;
  v_changed integer := 0;
  v_organization_names text[] := array[]::text[];
  v_last_revoke_source text;
begin
  if coalesce(p_address, '') !~ '^\+[1-9][0-9]{7,14}$' or p_granted is null then
    raise exception 'An E.164 address and a consent decision are required.' using errcode = '22023';
  end if;

  select * into v_connection
  from public.channel_connections sender
  where sender.id = p_connection_id;
  if not found then
    return jsonb_build_object('changed', 0, 'organizationNames', '[]'::jsonb);
  end if;

  for v_contact in
    select contact.id, contact.organization_id, organization.name as organization_name
    from public.contact_channels contact
    join public.organizations organization on organization.id = contact.organization_id
    where contact.channel = v_connection.channel
      and contact.address = p_address
      and contact.status = 'active'
      and (
        (v_connection.ownership = 'tenant' and contact.organization_id = v_connection.organization_id)
        or (v_connection.ownership = 'platform' and not exists (
          select 1
          from public.channel_connections tenant_connection
          where tenant_connection.organization_id = contact.organization_id
            and tenant_connection.channel = v_connection.channel
            and tenant_connection.ownership = 'tenant'
            and tenant_connection.status = 'active'
        ))
      )
    order by contact.organization_id
    for update of contact
  loop
    if not p_granted then
      update public.communication_consents
      set revoked_at = now(),
          revoke_source = 'whatsapp_keyword',
          revoke_evidence = p_provider_message_id
      where contact_channel_id = v_contact.id
        and category = 'operational'
        and revoked_at is null;

      if found then
        v_changed := v_changed + 1;
        v_organization_names := array_append(v_organization_names, v_contact.organization_name);
        insert into public.audit_events (organization_id, action, entity_type, entity_id, new_record)
        values (
          v_contact.organization_id, 'consent.revoked', 'contact_channels', v_contact.id::text,
          jsonb_build_object('category', 'operational', 'source', 'whatsapp_keyword', 'evidence', p_provider_message_id)
        );
      end if;
    else
      -- START only restores consent that was withdrawn by STOP, never consent an
      -- administrator or the member withdrew another way.
      select consent.revoke_source into v_last_revoke_source
      from public.communication_consents consent
      where consent.contact_channel_id = v_contact.id
        and consent.category = 'operational'
      order by consent.revoked_at desc nulls first
      limit 1;

      if v_last_revoke_source = 'whatsapp_keyword' then
        insert into public.communication_consents (
          organization_id, contact_channel_id, category, granted_at, grant_source, grant_evidence
        ) values (
          v_contact.organization_id, v_contact.id, 'operational', p_received_at, 'whatsapp_keyword', p_provider_message_id
        );
        v_changed := v_changed + 1;
        v_organization_names := array_append(v_organization_names, v_contact.organization_name);
        insert into public.audit_events (organization_id, action, entity_type, entity_id, new_record)
        values (
          v_contact.organization_id, 'consent.granted', 'contact_channels', v_contact.id::text,
          jsonb_build_object('category', 'operational', 'source', 'whatsapp_keyword', 'evidence', p_provider_message_id)
        );
      end if;
    end if;
  end loop;

  return jsonb_build_object('changed', v_changed, 'organizationNames', to_jsonb(v_organization_names));
end;
$$;

create or replace function public.comms_revoke_member_contact(
  p_organization_id uuid,
  p_channel text,
  p_profile_id uuid,
  p_firebase_uid text,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact record;
  v_count integer := 0;
begin
  if p_profile_id is null and p_firebase_uid is null then
    raise exception 'A member identity is required.' using errcode = '22023';
  end if;
  if coalesce(p_reason, '') not in ('member_request', 'membership_inactive', 'administrator') then
    raise exception 'Unsupported revocation reason.' using errcode = '22023';
  end if;

  for v_contact in
    select contact.id
    from public.contact_channels contact
    where contact.organization_id = p_organization_id
      and contact.channel = p_channel
      and contact.status <> 'revoked'
      and (
        (p_profile_id is not null and contact.profile_id = p_profile_id)
        or (p_firebase_uid is not null and contact.firebase_uid = p_firebase_uid)
      )
    for update
  loop
    update public.communication_consents
    set revoked_at = now(),
        revoke_source = p_reason
    where contact_channel_id = v_contact.id
      and revoked_at is null;

    update public.contact_channels
    set status = 'revoked',
        revoked_at = now(),
        revoked_reason = p_reason
    where id = v_contact.id;

    insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, new_record)
    values (
      p_organization_id, p_profile_id, 'contact.revoked', 'contact_channels', v_contact.id::text,
      jsonb_build_object('channel', p_channel, 'reason', p_reason, 'firebaseUid', p_firebase_uid)
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Status webhooks can arrive out of order and more than once. History is appended
-- once per distinct status, and the message status only moves forward.
create or replace function public.comms_record_delivery_status(
  p_provider_message_id text,
  p_status text,
  p_provider_timestamp timestamptz,
  p_error_code text default null,
  p_error_title text default null,
  p_pricing_category text default null,
  p_billable boolean default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_outbox public.message_outbox%rowtype;
  v_current_rank integer;
  v_next_rank integer;
begin
  if coalesce(p_status, '') not in ('sent', 'delivered', 'read', 'failed')
    or coalesce(btrim(p_provider_message_id), '') = ''
    or p_provider_timestamp is null then
    raise exception 'A provider message id, timestamp, and supported status are required.' using errcode = '22023';
  end if;

  select * into v_outbox
  from public.message_outbox outbox
  where outbox.provider_message_id = p_provider_message_id
  for update;
  if not found then
    return 'unknown_message';
  end if;

  insert into public.message_deliveries (
    organization_id, outbox_id, provider_message_id, status, provider_timestamp,
    error_code, error_title, pricing_category, billable
  ) values (
    v_outbox.organization_id, v_outbox.id, p_provider_message_id, p_status, p_provider_timestamp,
    left(p_error_code, 40), left(p_error_title, 500), left(p_pricing_category, 40), p_billable
  )
  on conflict (provider_message_id, status, provider_timestamp) do nothing;
  if not found then
    return 'duplicate';
  end if;

  if p_status = 'failed' then
    if v_outbox.status in ('sending', 'sent') then
      update public.message_outbox
      set status = 'failed',
          status_reason = 'provider_failed',
          failed_at = p_provider_timestamp,
          last_error_code = left(p_error_code, 40),
          last_error_message = left(p_error_title, 500),
          lease_expires_at = null
      where id = v_outbox.id;
    end if;
    return 'recorded';
  end if;

  v_current_rank := case v_outbox.status when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 0 end;
  v_next_rank := case p_status when 'sent' then 1 when 'delivered' then 2 else 3 end;

  if v_outbox.status in ('sending', 'sent', 'delivered') and v_next_rank > v_current_rank then
    update public.message_outbox
    set status = p_status,
        sent_at = coalesce(sent_at, p_provider_timestamp),
        delivered_at = case
          when p_status in ('delivered', 'read') then coalesce(delivered_at, p_provider_timestamp)
          else delivered_at
        end,
        read_at = case when p_status = 'read' then coalesce(read_at, p_provider_timestamp) else read_at end,
        lease_expires_at = null
    where id = v_outbox.id;
  end if;

  return 'recorded';
end;
$$;

create or replace function public.comms_record_audit_event(
  p_organization_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_details jsonb default '{}'::jsonb,
  p_actor_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(p_action, '') !~ '^[a-z]+(\.[a-z_]+)+$' or coalesce(btrim(p_entity_type), '') = '' then
    raise exception 'A dotted audit action and an entity type are required.' using errcode = '22023';
  end if;

  insert into public.audit_events (organization_id, actor_id, action, entity_type, entity_id, new_record)
  values (p_organization_id, p_actor_id, p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb));
end;
$$;

revoke all on function public.comms_sync_platform_connection(text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.comms_resolve_legacy_organization(text) from public, anon, authenticated;
revoke all on function public.comms_organization_context(uuid) from public, anon, authenticated;
revoke all on function public.comms_member_directory(uuid) from public, anon, authenticated;
revoke all on function public.comms_inventory_levels(uuid) from public, anon, authenticated;
revoke all on function public.consume_feature_usage_system(uuid, text, numeric, text, boolean, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.claim_notification_events(integer, integer, integer) from public, anon, authenticated;
revoke all on function public.claim_message_outbox(integer, integer, integer) from public, anon, authenticated;
revoke all on function public.comms_link_contact_channel(text, text, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.comms_set_keyword_consent(uuid, text, boolean, text, timestamptz) from public, anon, authenticated;
revoke all on function public.comms_revoke_member_contact(uuid, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.comms_record_delivery_status(text, text, timestamptz, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.comms_record_audit_event(uuid, text, text, text, jsonb, uuid) from public, anon, authenticated;

grant execute on function public.comms_sync_platform_connection(text, text, text, text, text, text, text) to service_role;
grant execute on function public.comms_resolve_legacy_organization(text) to service_role;
grant execute on function public.comms_organization_context(uuid) to service_role;
grant execute on function public.comms_member_directory(uuid) to service_role;
grant execute on function public.comms_inventory_levels(uuid) to service_role;
grant execute on function public.consume_feature_usage_system(uuid, text, numeric, text, boolean, text, uuid, jsonb) to service_role;
grant execute on function public.claim_notification_events(integer, integer, integer) to service_role;
grant execute on function public.claim_message_outbox(integer, integer, integer) to service_role;
grant execute on function public.comms_link_contact_channel(text, text, uuid, text, timestamptz) to service_role;
grant execute on function public.comms_set_keyword_consent(uuid, text, boolean, text, timestamptz) to service_role;
grant execute on function public.comms_revoke_member_contact(uuid, text, uuid, text, text) to service_role;
grant execute on function public.comms_record_delivery_status(text, text, timestamptz, text, text, text, boolean) to service_role;
grant execute on function public.comms_record_audit_event(uuid, text, text, text, jsonb, uuid) to service_role;

commit;
