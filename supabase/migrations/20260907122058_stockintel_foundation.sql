begin;

create extension if not exists citext with schema extensions;

create schema if not exists app_private;
revoke all on schema app_private from public;

create type public.app_role as enum ('owner', 'manager', 'worker');
create type public.app_permission as enum (
  'dashboard', 'expenses', 'team', 'rewards', 'billing', 'settings',
  'agricStock', 'agricRequests', 'agricUsage', 'agricPlanner',
  'agricEquipment', 'agricPacking', 'agricReports', 'agricWeather',
  'agricLivestock', 'agricCrops', 'agricSigatoka'
);
create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');
create type public.subscription_plan as enum ('free_trial', 'pro', 'enterprise');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'expired', 'cancelled');
create type public.billing_interval as enum ('month', 'year', 'custom');
create type public.farm_operation as enum ('crop', 'livestock', 'poultry');
create type public.unit_dimension as enum ('mass', 'volume', 'count', 'length', 'area', 'packaging', 'other');

create table public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  email extensions.citext not null unique,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.platform_admins (email, notes)
values
  ('mawuklegodson@gmail.com', 'Bootstrap StockIntel super administrator'),
  ('enochapafloe@gmail.com', 'Bootstrap StockIntel super administrator'),
  ('stockintel01@gmail.com', 'Bootstrap StockIntel super administrator')
on conflict (email) do nothing;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  legacy_firebase_uid text unique,
  email extensions.citext not null unique,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 160),
  photo_url text,
  default_organization_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text unique,
  name text not null check (char_length(btrim(name)) between 2 and 180),
  owner_id uuid not null references auth.users(id) on delete restrict,
  industry text not null default 'agriculture' check (industry = 'agriculture'),
  referral_code text not null unique,
  currency char(3) not null default 'GHS' check (currency = upper(currency)),
  timezone text not null default 'Africa/Accra',
  address text,
  phone text,
  tax_id text,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  receipt_settings jsonb not null default '{}'::jsonb check (jsonb_typeof(receipt_settings) = 'object'),
  onboarding_step integer not null default 0 check (onboarding_step >= 0),
  onboarding_complete boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1
);

alter table public.profiles
  add constraint profiles_default_organization_fk
  foreign key (default_organization_id) references public.organizations(id) on delete set null;

create table public.organization_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  legacy_firebase_membership_id text,
  role public.app_role not null,
  permissions public.app_permission[] not null default array[]::public.app_permission[],
  job_title text,
  active boolean not null default true,
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  primary key (organization_id, user_id)
);

create unique index organization_memberships_single_owner_idx
  on public.organization_memberships (organization_id)
  where role = 'owner' and active;

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text unique,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email extensions.citext not null,
  role public.app_role not null check (role in ('manager', 'worker')),
  permissions public.app_permission[] not null default array[]::public.app_permission[],
  status public.invitation_status not null default 'pending',
  token_hash text,
  expires_at timestamptz not null,
  invited_by uuid not null references auth.users(id) on delete restrict,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  check ((status = 'accepted') = (accepted_at is not null and accepted_by is not null))
);

create unique index invitations_one_pending_per_email_idx
  on public.invitations (organization_id, email)
  where status = 'pending';

create table public.role_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  key text not null,
  label text not null,
  description text,
  role public.app_role not null check (role in ('manager', 'worker')),
  permissions public.app_permission[] not null,
  is_system boolean not null default false,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1
);

create unique index role_templates_system_key_idx
  on public.role_templates (key)
  where organization_id is null;
create unique index role_templates_org_key_idx
  on public.role_templates (organization_id, key)
  where organization_id is not null;

insert into public.role_templates (key, label, description, role, permissions, is_system)
values
  ('stockkeeper', 'Stockkeeper', 'Controls inventory, fulfils stock requests, and records issued inputs.', 'worker', array['dashboard','agricStock','agricRequests','agricUsage']::public.app_permission[], true),
  ('packhouse_supervisor', 'Packhouse Supervisor', 'Runs packing, quality, storage, and shipment records.', 'worker', array['dashboard','agricPacking']::public.app_permission[], true),
  ('field_supervisor', 'Field Supervisor', 'Coordinates crop work, requests, usage, planning, weather, and disease scouting.', 'worker', array['dashboard','agricRequests','agricUsage','agricPlanner','agricWeather','agricCrops','agricSigatoka']::public.app_permission[], true),
  ('disease_scout', 'Disease Scout', 'Records disease observations and reviews assigned monitoring results.', 'worker', array['dashboard','agricSigatoka','agricWeather']::public.app_permission[], true),
  ('livestock_supervisor', 'Livestock Supervisor', 'Runs animal production, feed, health, and related stock requests.', 'worker', array['dashboard','agricLivestock','agricRequests','agricWeather']::public.app_permission[], true),
  ('equipment_custodian', 'Equipment Custodian', 'Tracks equipment availability, checkout, return, and condition.', 'worker', array['dashboard','agricEquipment']::public.app_permission[], true),
  ('finance_officer', 'Finance Officer', 'Maintains expenses and reviews authorized operational reports.', 'worker', array['dashboard','expenses','agricReports']::public.app_permission[], true),
  ('report_viewer', 'Reports Viewer', 'Reads the farm overview and operations reports.', 'worker', array['dashboard','agricReports']::public.app_permission[], true),
  ('farm_manager', 'Farm Manager', 'Runs farm operations, staff access, expenses, reporting, and settings.', 'manager', array['dashboard','expenses','team','settings','agricStock','agricRequests','agricUsage','agricPlanner','agricEquipment','agricPacking','agricReports','agricWeather','agricLivestock','agricCrops','agricSigatoka']::public.app_permission[], true)
on conflict do nothing;

create table public.plans (
  id public.subscription_plan primary key,
  name text not null,
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.plans (id, name, description, sort_order)
values
  ('free_trial', 'Free trial', 'Time-limited evaluation with restricted usage.', 10),
  ('pro', 'Pro', 'Production plan for growing farms.', 20),
  ('enterprise', 'Enterprise', 'Unlimited organization usage with negotiated support.', 30)
on conflict (id) do nothing;

create table public.plan_entitlements (
  plan_id public.subscription_plan not null references public.plans(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default true,
  limit_value numeric,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (plan_id, feature_key),
  check (limit_value is null or limit_value >= 0)
);

insert into public.plan_entitlements (plan_id, feature_key, enabled, limit_value)
values
  ('free_trial', 'team_members', true, 3),
  ('free_trial', 'inventory_items', true, 100),
  ('free_trial', 'bulk_import', false, 0),
  ('free_trial', 'ai', false, 0),
  ('free_trial', 'advanced_reports', false, 0),
  ('pro', 'team_members', true, 25),
  ('pro', 'inventory_items', true, 5000),
  ('pro', 'bulk_import', true, null),
  ('pro', 'ai', true, null),
  ('pro', 'advanced_reports', true, null),
  ('enterprise', 'team_members', true, null),
  ('enterprise', 'inventory_items', true, null),
  ('enterprise', 'bulk_import', true, null),
  ('enterprise', 'ai', true, null),
  ('enterprise', 'advanced_reports', true, null)
on conflict (plan_id, feature_key) do nothing;

create table public.plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_id public.subscription_plan not null references public.plans(id) on delete cascade,
  currency char(3) not null check (currency = upper(currency)),
  interval public.billing_interval not null,
  amount_minor bigint not null check (amount_minor >= 0),
  stripe_price_id text unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, currency, interval)
);

create table public.organization_subscriptions (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  plan_id public.subscription_plan not null references public.plans(id),
  status public.subscription_status not null,
  provider text not null default 'stripe',
  provider_customer_id text,
  provider_subscription_id text unique,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  override_limits jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  check (jsonb_typeof(override_limits) = 'object')
);

create table public.usage_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  feature_key text not null,
  quantity numeric not null default 1 check (quantity > 0),
  actor_id uuid references auth.users(id) on delete set null,
  source_type text,
  source_id uuid,
  idempotency_key text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create unique index usage_events_idempotency_idx
  on public.usage_events (organization_id, idempotency_key)
  where idempotency_key is not null;
create index usage_events_period_idx
  on public.usage_events (organization_id, feature_key, occurred_at desc);

create table public.usage_period_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  feature_key text not null,
  period_start date not null,
  period_end date not null,
  quantity numeric not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (organization_id, feature_key, period_start),
  check (period_end >= period_start)
);

create table public.farm_profiles (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  operation_types public.farm_operation[] not null default array['crop']::public.farm_operation[],
  crop_types text[] not null default '{}',
  livestock_types text[] not null default '{}',
  modules jsonb not null default '{}'::jsonb,
  naming jsonb not null default jsonb_build_object('sector', 'Sector', 'plot', 'Plot', 'plant', 'Sentinel plant'),
  week_starts_on smallint not null default 0 check (week_starts_on between 0 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  check (cardinality(operation_types) > 0),
  check (jsonb_typeof(modules) = 'object'),
  check (jsonb_typeof(naming) = 'object')
);

create table public.farm_locations (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  timezone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  unique (organization_id, name)
);

create table public.farm_zones (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.farm_locations(id) on delete set null,
  parent_zone_id uuid references public.farm_zones(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  zone_type text not null default 'field',
  crop_name text,
  area numeric check (area is null or area >= 0),
  area_unit text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  unique (organization_id, name)
);

create table public.units_of_measure (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  code extensions.citext not null,
  name text not null,
  dimension public.unit_dimension not null,
  base_code extensions.citext not null,
  factor_to_base numeric not null check (factor_to_base > 0),
  symbol text,
  decimals smallint not null default 3 check (decimals between 0 and 9),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index units_global_code_idx
  on public.units_of_measure (code)
  where organization_id is null;
create unique index units_org_code_idx
  on public.units_of_measure (organization_id, code)
  where organization_id is not null;

insert into public.units_of_measure (code, name, dimension, base_code, factor_to_base, symbol)
values
  ('kg', 'Kilogram', 'mass', 'kg', 1, 'kg'),
  ('g', 'Gram', 'mass', 'kg', 0.001, 'g'),
  ('mg', 'Milligram', 'mass', 'kg', 0.000001, 'mg'),
  ('t', 'Metric tonne', 'mass', 'kg', 1000, 't'),
  ('L', 'Litre', 'volume', 'L', 1, 'L'),
  ('ml', 'Millilitre', 'volume', 'L', 0.001, 'ml'),
  ('m3', 'Cubic metre', 'volume', 'L', 1000, 'm3'),
  ('unit', 'Unit', 'count', 'unit', 1, 'unit'),
  ('box', 'Box', 'packaging', 'box', 1, 'box'),
  ('bag', 'Bag', 'packaging', 'bag', 1, 'bag'),
  ('tray', 'Tray', 'packaging', 'tray', 1, 'tray'),
  ('crate', 'Crate', 'packaging', 'crate', 1, 'crate'),
  ('ha', 'Hectare', 'area', 'm2', 10000, 'ha'),
  ('acre', 'Acre', 'area', 'm2', 4046.8564224, 'ac'),
  ('m2', 'Square metre', 'area', 'm2', 1, 'm2')
on conflict do nothing;

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

commit;
