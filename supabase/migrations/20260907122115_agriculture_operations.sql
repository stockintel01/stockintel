begin;

create type public.inventory_category as enum ('fungicide', 'insecticide', 'herbicide', 'fertilizer', 'equipment', 'seed', 'feed', 'vaccine', 'packaging', 'produce', 'other');
create type public.inventory_movement_type as enum ('opening', 'receipt', 'usage', 'issue', 'return', 'adjustment', 'damage', 'loss', 'transfer_in', 'transfer_out', 'packing_in', 'shipment', 'sale', 'reversal');
create type public.adjustment_status as enum ('pending_approval', 'approved', 'rejected');
create type public.request_status as enum ('draft', 'pending', 'approved', 'partially_fulfilled', 'dispatched', 'received', 'rejected', 'cancelled', 'closed');
create type public.request_item_mode as enum ('consumable', 'returnable');
create type public.return_condition as enum ('good', 'damaged', 'lost');
create type public.equipment_condition as enum ('good', 'damaged', 'lost', 'maintenance');
create type public.plan_status as enum ('draft', 'active', 'paused', 'completed', 'archived');
create type public.market_scope as enum ('local', 'export');
create type public.inspection_status as enum ('awaiting_inspection', 'partially_accepted', 'accepted', 'rework', 'rejected');
create type public.quality_event_type as enum ('inspection', 'rework_resolution', 'correction');
create type public.payment_status as enum ('unpaid', 'partially_paid', 'paid', 'refunded', 'void');
create type public.expense_status as enum ('pending', 'approved', 'paid', 'rejected', 'void');
create type public.record_status as enum ('draft', 'submitted', 'verified', 'archived');

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  chemical_component text,
  category public.inventory_category not null,
  stock_unit_id uuid not null references public.units_of_measure(id),
  pack_description text,
  minimum_stock numeric not null default 0 check (minimum_stock >= 0),
  reorder_alert_days integer not null default 7 check (reorder_alert_days >= 0),
  supplier_name text,
  unit_cost numeric check (unit_cost is null or unit_cost >= 0),
  storage_location text,
  average_weekly_usage numeric check (average_weekly_usage is null or average_weekly_usage >= 0),
  last_received_on date,
  last_received_quantity numeric check (last_received_quantity is null or last_received_quantity >= 0),
  active boolean not null default true,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  archive_reason text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  unique (id, organization_id),
  unique (organization_id, legacy_firebase_id)
);

create index inventory_items_lookup_idx
  on public.inventory_items (organization_id, active, category, name);

create table public.inventory_item_units (
  item_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid not null references public.units_of_measure(id),
  quantity_in_stock_unit numeric not null check (quantity_in_stock_unit > 0),
  label text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (item_id, unit_id),
  foreign key (item_id, organization_id) references public.inventory_items(id, organization_id) on delete cascade
);

create table public.inventory_balances (
  item_id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quantity numeric not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  foreign key (item_id, organization_id) references public.inventory_items(id, organization_id) on delete cascade
);

create index inventory_balances_org_idx on public.inventory_balances (organization_id);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  item_id uuid not null,
  movement_type public.inventory_movement_type not null,
  quantity_delta numeric not null check (quantity_delta <> 0),
  original_quantity numeric check (original_quantity is null or original_quantity > 0),
  original_unit_id uuid references public.units_of_measure(id),
  unit_cost numeric check (unit_cost is null or unit_cost >= 0),
  farm_zone_id uuid references public.farm_zones(id) on delete set null,
  source_type text,
  source_id uuid,
  source_legacy_id text,
  occurred_at timestamptz not null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text,
  reversal_of uuid references public.inventory_movements(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (item_id, organization_id) references public.inventory_items(id, organization_id) on delete restrict,
  unique (organization_id, idempotency_key),
  unique (organization_id, legacy_firebase_id),
  check (jsonb_typeof(metadata) = 'object')
);

create index inventory_movements_item_time_idx
  on public.inventory_movements (organization_id, item_id, occurred_at desc);
create index inventory_movements_source_idx
  on public.inventory_movements (organization_id, source_type, source_id);

create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  item_id uuid not null,
  requested_quantity numeric not null check (requested_quantity >= 0),
  expected_quantity numeric not null check (expected_quantity >= 0),
  reason text not null check (char_length(btrim(reason)) >= 3),
  notes text,
  status public.adjustment_status not null default 'pending_approval',
  requested_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  movement_id uuid references public.inventory_movements(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  foreign key (item_id, organization_id) references public.inventory_items(id, organization_id) on delete restrict,
  unique (organization_id, legacy_firebase_id)
);

create table public.stock_requests (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_number text not null,
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_by_name text not null,
  farm_zone_id uuid references public.farm_zones(id) on delete set null,
  farm_zone_name text,
  requested_at timestamptz not null default now(),
  required_by_date date,
  status public.request_status not null default 'pending',
  priority text not null default 'normal' check (priority in ('normal', 'urgent')),
  notes text,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  unique (id, organization_id),
  unique (organization_id, request_number),
  unique (organization_id, legacy_firebase_id)
);

create index stock_requests_queue_idx
  on public.stock_requests (organization_id, status, priority, required_by_date, requested_at);

create table public.stock_request_items (
  id uuid primary key default gen_random_uuid(),
  legacy_item_key text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null,
  item_id uuid not null,
  requested_quantity numeric not null check (requested_quantity > 0),
  requested_unit_id uuid not null references public.units_of_measure(id),
  requested_quantity_in_stock_unit numeric not null check (requested_quantity_in_stock_unit > 0),
  mode public.request_item_mode not null,
  notes text,
  created_at timestamptz not null default now(),
  foreign key (request_id, organization_id) references public.stock_requests(id, organization_id) on delete cascade,
  foreign key (item_id, organization_id) references public.inventory_items(id, organization_id) on delete restrict,
  unique (id, organization_id),
  unique (request_id, item_id)
);

create table public.stock_issues (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null,
  request_item_id uuid not null,
  item_id uuid not null,
  quantity numeric not null check (quantity > 0),
  stock_unit_id uuid not null references public.units_of_measure(id),
  mode public.request_item_mode not null,
  issued_to uuid references auth.users(id) on delete set null,
  issued_to_name text not null,
  issued_by uuid not null references auth.users(id) on delete restrict,
  issued_at timestamptz not null,
  expected_return_at timestamptz,
  usage_recorded_at timestamptz,
  usage_recorded_by uuid references auth.users(id) on delete set null,
  returned_quantity numeric not null default 0 check (returned_quantity >= 0),
  damaged_quantity numeric not null default 0 check (damaged_quantity >= 0),
  lost_quantity numeric not null default 0 check (lost_quantity >= 0),
  notes text,
  inventory_movement_id uuid not null references public.inventory_movements(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  foreign key (request_id, organization_id) references public.stock_requests(id, organization_id) on delete cascade,
  foreign key (request_item_id, organization_id) references public.stock_request_items(id, organization_id) on delete restrict,
  foreign key (item_id, organization_id) references public.inventory_items(id, organization_id) on delete restrict,
  unique (id, organization_id),
  unique (organization_id, legacy_firebase_id),
  check (returned_quantity + damaged_quantity + lost_quantity <= quantity),
  check ((mode = 'returnable') or expected_return_at is null)
);

create table public.stock_issue_returns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  issue_id uuid not null,
  quantity numeric not null check (quantity > 0),
  condition public.return_condition not null,
  returned_by uuid not null references auth.users(id) on delete restrict,
  returned_at timestamptz not null,
  notes text,
  inventory_movement_id uuid references public.inventory_movements(id) on delete restrict,
  idempotency_key text,
  created_at timestamptz not null default now(),
  foreign key (issue_id, organization_id) references public.stock_issues(id, organization_id) on delete restrict,
  unique (organization_id, idempotency_key)
);

create table public.stock_request_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null,
  event_type text not null,
  actor_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb,
  idempotency_key text,
  foreign key (request_id, organization_id) references public.stock_requests(id, organization_id) on delete cascade,
  unique (organization_id, idempotency_key),
  check (jsonb_typeof(details) = 'object')
);

create table public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  item_id uuid not null,
  issue_id uuid,
  farm_zone_id uuid references public.farm_zones(id) on delete set null,
  applied_at timestamptz not null,
  quantity numeric not null check (quantity > 0),
  unit_id uuid not null references public.units_of_measure(id),
  quantity_in_stock_unit numeric not null check (quantity_in_stock_unit > 0),
  applied_by_name text not null,
  supervisor_id uuid references auth.users(id) on delete set null,
  batch_number text,
  notes text,
  farm_week smallint check (farm_week between 1 and 53),
  farm_week_year integer,
  week_start_date date,
  week_end_date date,
  inventory_movement_id uuid references public.inventory_movements(id) on delete restrict,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  foreign key (item_id, organization_id) references public.inventory_items(id, organization_id) on delete restrict,
  foreign key (issue_id, organization_id) references public.stock_issues(id, organization_id) on delete restrict,
  unique (organization_id, legacy_firebase_id),
  check (week_end_date is null or week_start_date is null or week_end_date >= week_start_date)
);

create index usage_logs_reporting_idx on public.usage_logs (organization_id, applied_at desc, farm_zone_id, item_id);

create table public.equipment_assets (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inventory_item_id uuid,
  asset_code text not null,
  name text not null,
  serial_number text,
  current_condition public.equipment_condition not null default 'good',
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  foreign key (inventory_item_id, organization_id) references public.inventory_items(id, organization_id) on delete restrict,
  unique (id, organization_id),
  unique (organization_id, asset_code),
  unique (organization_id, serial_number)
);

create table public.equipment_checkouts (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  asset_id uuid not null,
  checked_out_to uuid references auth.users(id) on delete set null,
  checked_out_to_name text not null,
  checked_out_by uuid not null references auth.users(id) on delete restrict,
  checked_out_at timestamptz not null,
  expected_return_at timestamptz,
  returned_at timestamptz,
  returned_condition public.equipment_condition,
  farm_zone_id uuid references public.farm_zones(id) on delete set null,
  purpose text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  foreign key (asset_id, organization_id) references public.equipment_assets(id, organization_id) on delete restrict,
  unique (organization_id, legacy_firebase_id),
  check ((returned_at is null) = (returned_condition is null))
);

create unique index equipment_one_open_checkout_idx
  on public.equipment_checkouts (asset_id)
  where returned_at is null;

create table public.spray_plans (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  farm_zone_id uuid references public.farm_zones(id) on delete set null,
  cycle text not null check (cycle in ('weekly', 'biweekly', 'monthly', 'custom')),
  start_date date not null,
  end_date date not null,
  total_applications integer not null check (total_applications > 0),
  status public.plan_status not null default 'draft',
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  unique (id, organization_id),
  unique (organization_id, legacy_firebase_id),
  check (end_date >= start_date)
);

create table public.spray_plan_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null,
  item_id uuid not null,
  quantity_per_application numeric not null check (quantity_per_application > 0),
  requested_unit_id uuid not null references public.units_of_measure(id),
  quantity_per_application_in_stock_unit numeric not null check (quantity_per_application_in_stock_unit > 0),
  restock_required_by date,
  created_at timestamptz not null default now(),
  foreign key (plan_id, organization_id) references public.spray_plans(id, organization_id) on delete cascade,
  foreign key (item_id, organization_id) references public.inventory_items(id, organization_id) on delete restrict,
  unique (plan_id, item_id)
);

create table public.spray_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_id uuid not null,
  applied_at timestamptz not null,
  notes text,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  idempotency_key text,
  created_at timestamptz not null default now(),
  foreign key (plan_id, organization_id) references public.spray_plans(id, organization_id) on delete cascade,
  unique (organization_id, idempotency_key)
);

create table public.packing_stations (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  storage_name text,
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  unique (id, organization_id),
  unique (organization_id, name),
  unique (organization_id, legacy_firebase_id)
);

create table public.packing_station_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  station_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (station_id, user_id),
  foreign key (station_id, organization_id) references public.packing_stations(id, organization_id) on delete cascade,
  foreign key (organization_id, user_id) references public.organization_memberships(organization_id, user_id) on delete cascade
);

create table public.packing_quality_standards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  standard_key text not null,
  name text not null,
  commodity text not null,
  market public.market_scope not null,
  destination_countries text[] not null default '{}',
  authority text not null,
  reference text not null,
  version text not null,
  source_url text,
  package_types text[] not null default '{}',
  package_sizes text[] not null default '{}',
  rejection_reasons text[] not null default '{}',
  required_checks text[] not null default '{}',
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  check (market <> 'export' or char_length(coalesce(source_url, '')) >= 8)
);

create unique index packing_quality_standards_global_idx
  on public.packing_quality_standards (standard_key)
  where organization_id is null;
create unique index packing_quality_standards_org_idx
  on public.packing_quality_standards (organization_id, standard_key)
  where organization_id is not null;

create table public.packing_quality_grades (
  id uuid primary key default gen_random_uuid(),
  standard_id uuid not null references public.packing_quality_standards(id) on delete cascade,
  name text not null,
  description text,
  acceptance_criteria text[] not null default '{}',
  sort_order integer not null default 0,
  unique (standard_id, name)
);

create table public.packing_crew_profiles (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  unique (id, organization_id),
  unique (organization_id, name)
);

create table public.packing_crew_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  crew_id uuid not null,
  worker_name text not null,
  user_id uuid references auth.users(id) on delete set null,
  sort_order integer not null default 0,
  primary key (crew_id, worker_name),
  foreign key (crew_id, organization_id) references public.packing_crew_profiles(id, organization_id) on delete cascade
);

create table public.transport_profiles (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  label text not null,
  vehicle_identifier text not null,
  driver_name text not null,
  driver_contact text,
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  unique (id, organization_id),
  unique (organization_id, vehicle_identifier)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  email extensions.citext,
  phone text,
  address text,
  destination_country text,
  tax_id text,
  default_currency char(3),
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  unique (id, organization_id),
  unique (organization_id, legacy_firebase_id)
);

create table public.packing_fulfilment_plans (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  activity_name text not null,
  customer_id uuid,
  customer_name text not null,
  destination_name text,
  station_id uuid not null,
  farm_zone_id uuid references public.farm_zones(id) on delete set null,
  produce text not null,
  market public.market_scope not null,
  destination_country text,
  target_packages numeric not null check (target_packages > 0),
  start_date date not null,
  due_time time,
  recurrence text not null default 'none' check (recurrence in ('none', 'weekly', 'biweekly', 'monthly')),
  end_date date,
  shipment_required boolean not null default true,
  crew_profile_id uuid,
  transport_profile_id uuid,
  status public.plan_status not null default 'active',
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  foreign key (station_id, organization_id) references public.packing_stations(id, organization_id) on delete restrict,
  foreign key (customer_id, organization_id) references public.customers(id, organization_id) on delete restrict,
  foreign key (crew_profile_id, organization_id) references public.packing_crew_profiles(id, organization_id) on delete restrict,
  foreign key (transport_profile_id, organization_id) references public.transport_profiles(id, organization_id) on delete restrict,
  unique (id, organization_id),
  unique (organization_id, legacy_firebase_id),
  check (end_date is null or end_date >= start_date),
  check (market <> 'export' or char_length(btrim(coalesce(destination_country, ''))) >= 2)
);

create table public.packing_records (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  packed_on date not null,
  station_id uuid not null,
  supervisor_id uuid not null references auth.users(id) on delete restrict,
  supervisor_name text not null,
  farm_zone_id uuid references public.farm_zones(id) on delete set null,
  produce text not null,
  market public.market_scope not null,
  destination_country text,
  target_packages numeric not null default 0 check (target_packages >= 0),
  packed_packages numeric not null check (packed_packages >= 0),
  rejected_packages numeric not null default 0 check (rejected_packages >= 0),
  total_weight_kg numeric check (total_weight_kg is null or total_weight_kg >= 0),
  shift text not null check (shift in ('morning', 'afternoon', 'evening')),
  package_type text not null,
  package_size text,
  quality_grade text,
  lot_number text not null,
  pallet_id text,
  storage_location text,
  inspection_status public.inspection_status not null default 'awaiting_inspection',
  inspected_packages numeric not null default 0 check (inspected_packages >= 0),
  accepted_packages numeric not null default 0 check (accepted_packages >= 0),
  rework_packages numeric not null default 0 check (rework_packages >= 0),
  quality_standard_id uuid references public.packing_quality_standards(id) on delete restrict,
  quality_standard_snapshot jsonb not null default '{}'::jsonb,
  fulfilment_plan_id uuid,
  fulfilment_occurrence_date date,
  customer_id uuid,
  notes text,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  foreign key (station_id, organization_id) references public.packing_stations(id, organization_id) on delete restrict,
  foreign key (fulfilment_plan_id, organization_id) references public.packing_fulfilment_plans(id, organization_id) on delete restrict,
  foreign key (customer_id, organization_id) references public.customers(id, organization_id) on delete restrict,
  unique (id, organization_id),
  unique (organization_id, legacy_firebase_id),
  check (inspected_packages <= packed_packages),
  check (accepted_packages + rejected_packages + rework_packages = inspected_packages),
  check (market <> 'export' or char_length(btrim(coalesce(destination_country, ''))) >= 2),
  check (jsonb_typeof(quality_standard_snapshot) = 'object')
);

create index packing_records_stock_idx
  on public.packing_records (organization_id, station_id, produce, lot_number, packed_on);

create table public.packing_quality_events (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  packing_record_id uuid not null,
  event_type public.quality_event_type not null,
  inspected_delta numeric not null default 0,
  accepted_delta numeric not null default 0,
  rejected_delta numeric not null default 0,
  rework_delta numeric not null default 0,
  confirmed_checks text[] not null default '{}',
  reason text,
  notes text,
  inspector_id uuid not null references auth.users(id) on delete restrict,
  inspector_name text not null,
  inspected_at timestamptz not null,
  standard_snapshot jsonb not null default '{}'::jsonb,
  correction_of uuid references public.packing_quality_events(id) on delete restrict,
  idempotency_key text,
  created_at timestamptz not null default now(),
  foreign key (packing_record_id, organization_id) references public.packing_records(id, organization_id) on delete restrict,
  unique (organization_id, legacy_firebase_id),
  unique (organization_id, idempotency_key),
  check (jsonb_typeof(standard_snapshot) = 'object'),
  check (event_type = 'correction' or inspected_delta >= 0),
  check (event_type = 'correction' or accepted_delta >= 0),
  check (event_type = 'correction' or rejected_delta >= 0),
  check (event_type = 'correction' or (rework_delta >= 0 or event_type = 'rework_resolution'))
);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  shipment_number text not null,
  dispatched_at timestamptz not null,
  station_id uuid,
  customer_id uuid,
  destination_name text not null,
  destination_country text,
  market public.market_scope not null,
  produce text not null,
  packages_shipped numeric not null check (packages_shipped > 0),
  weight_shipped_kg numeric check (weight_shipped_kg is null or weight_shipped_kg >= 0),
  transport_profile_id uuid,
  vehicle_identifier text,
  driver_name text,
  quality_standard_snapshot jsonb not null default '{}'::jsonb,
  notes text,
  dispatched_by uuid not null references auth.users(id) on delete restrict,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  foreign key (station_id, organization_id) references public.packing_stations(id, organization_id) on delete restrict,
  foreign key (customer_id, organization_id) references public.customers(id, organization_id) on delete restrict,
  foreign key (transport_profile_id, organization_id) references public.transport_profiles(id, organization_id) on delete restrict,
  unique (id, organization_id),
  unique (organization_id, shipment_number),
  unique (organization_id, legacy_firebase_id),
  check (market <> 'export' or char_length(btrim(coalesce(destination_country, ''))) >= 2)
);

create table public.shipment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  shipment_id uuid not null,
  packing_record_id uuid not null,
  packages numeric not null check (packages > 0),
  created_at timestamptz not null default now(),
  foreign key (shipment_id, organization_id) references public.shipments(id, organization_id) on delete cascade,
  foreign key (packing_record_id, organization_id) references public.packing_records(id, organization_id) on delete restrict,
  unique (shipment_id, packing_record_id)
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sale_number text not null,
  shipment_id uuid,
  customer_id uuid,
  sold_at timestamptz not null,
  currency char(3) not null check (currency = upper(currency)),
  subtotal numeric not null check (subtotal >= 0),
  discount_amount numeric not null default 0 check (discount_amount >= 0),
  tax_rate numeric not null default 0 check (tax_rate >= 0),
  tax_amount numeric not null default 0 check (tax_amount >= 0),
  total_amount numeric not null check (total_amount >= 0),
  amount_paid numeric not null default 0 check (amount_paid >= 0),
  payment_status public.payment_status not null default 'unpaid',
  notes text,
  sold_by uuid not null references auth.users(id) on delete restrict,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  foreign key (shipment_id, organization_id) references public.shipments(id, organization_id) on delete restrict,
  foreign key (customer_id, organization_id) references public.customers(id, organization_id) on delete restrict,
  unique (id, organization_id),
  unique (organization_id, sale_number),
  unique (organization_id, legacy_firebase_id),
  check (discount_amount <= subtotal),
  check (total_amount = subtotal - discount_amount + tax_amount)
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sale_id uuid not null,
  description text not null,
  item_id uuid,
  quantity numeric not null check (quantity > 0),
  unit_id uuid references public.units_of_measure(id),
  unit_price numeric not null check (unit_price >= 0),
  line_total numeric generated always as (quantity * unit_price) stored,
  metadata jsonb not null default '{}'::jsonb,
  foreign key (sale_id, organization_id) references public.sales(id, organization_id) on delete cascade,
  foreign key (item_id, organization_id) references public.inventory_items(id, organization_id) on delete restrict,
  check (jsonb_typeof(metadata) = 'object')
);

create table public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sale_id uuid not null,
  amount numeric not null check (amount <> 0),
  currency char(3) not null,
  method text not null check (method in ('cash', 'mobile_money', 'bank_transfer', 'card', 'credit', 'refund', 'other')),
  reference text,
  paid_at timestamptz not null,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  reversal_of uuid references public.sale_payments(id) on delete restrict,
  idempotency_key text,
  created_at timestamptz not null default now(),
  foreign key (sale_id, organization_id) references public.sales(id, organization_id) on delete restrict,
  unique (organization_id, idempotency_key)
);

create table public.sales_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sale_id uuid not null,
  receipt_number text not null,
  template_snapshot jsonb not null,
  sale_snapshot jsonb not null,
  pdf_storage_path text,
  issued_at timestamptz not null default now(),
  issued_by uuid not null references auth.users(id) on delete restrict,
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  void_reason text,
  created_at timestamptz not null default now(),
  foreign key (sale_id, organization_id) references public.sales(id, organization_id) on delete restrict,
  unique (organization_id, receipt_number),
  check (jsonb_typeof(template_snapshot) = 'object'),
  check (jsonb_typeof(sale_snapshot) = 'object'),
  check ((voided_at is null) = (voided_by is null))
);

create table public.document_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_type text not null,
  prefix text not null,
  next_value bigint not null default 1 check (next_value > 0),
  updated_at timestamptz not null default now(),
  primary key (organization_id, document_type)
);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  color text not null default '#64748b',
  kind text not null default 'general',
  active boolean not null default true,
  requires_approval boolean not null default false,
  monthly_limit numeric check (monthly_limit is null or monthly_limit >= 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  unique (id, organization_id),
  unique (organization_id, name),
  unique (organization_id, legacy_firebase_id)
);

create table public.expense_budgets (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid,
  name text not null,
  amount numeric not null check (amount > 0),
  currency char(3) not null,
  period text not null check (period in ('monthly', 'quarterly', 'annual', 'custom')),
  start_date date not null,
  end_date date not null,
  alert_threshold_percent numeric not null default 80 check (alert_threshold_percent between 0 and 100),
  active boolean not null default true,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  foreign key (category_id, organization_id) references public.expense_categories(id, organization_id) on delete restrict,
  unique (id, organization_id),
  unique (organization_id, legacy_firebase_id),
  check (end_date >= start_date)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid not null,
  budget_id uuid,
  title text not null,
  amount numeric not null check (amount > 0),
  currency char(3) not null,
  expense_date date not null,
  vendor text,
  payment_method text not null,
  status public.expense_status not null default 'pending',
  recurring boolean not null default false,
  recurrence text check (recurrence is null or recurrence in ('weekly', 'monthly', 'quarterly', 'annual')),
  cost_center text,
  reference text,
  receipt_storage_path text,
  notes text,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  foreign key (category_id, organization_id) references public.expense_categories(id, organization_id) on delete restrict,
  foreign key (budget_id, organization_id) references public.expense_budgets(id, organization_id) on delete restrict,
  unique (organization_id, legacy_firebase_id),
  check (recurring or recurrence is null)
);

create index expenses_reporting_idx on public.expenses (organization_id, expense_date desc, category_id, status);

create table public.crop_plans (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  farm_zone_id uuid references public.farm_zones(id) on delete set null,
  crop_name text not null,
  variety text,
  planted_on date,
  expected_harvest_on date,
  area numeric check (area is null or area >= 0),
  area_unit text,
  status public.plan_status not null default 'draft',
  details jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  unique (organization_id, legacy_firebase_id),
  check (expected_harvest_on is null or planted_on is null or expected_harvest_on >= planted_on),
  check (jsonb_typeof(details) = 'object')
);

create table public.livestock_pens (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  pen_type text not null,
  capacity integer not null check (capacity >= 0),
  farm_zone_id uuid references public.farm_zones(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  unique (id, organization_id),
  unique (organization_id, name),
  unique (organization_id, legacy_firebase_id)
);

create table public.livestock_groups (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pen_id uuid,
  name text not null,
  species text not null,
  breed text,
  purpose text not null,
  initial_count integer not null check (initial_count >= 0),
  current_count integer not null check (current_count >= 0),
  placed_or_born_on date,
  status text not null default 'active' check (status in ('active', 'completed', 'sold', 'culled')),
  details jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  foreign key (pen_id, organization_id) references public.livestock_pens(id, organization_id) on delete restrict,
  unique (id, organization_id),
  unique (organization_id, name),
  unique (organization_id, legacy_firebase_id),
  check (jsonb_typeof(details) = 'object')
);

create table public.livestock_events (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid,
  event_kind text not null check (event_kind in ('egg_production', 'egg_sale', 'feed_log', 'feed_plan', 'mortality', 'vaccination', 'weight', 'milk', 'livestock_sale', 'population_adjustment')),
  event_date date not null,
  payload jsonb not null,
  inventory_movement_id uuid references public.inventory_movements(id) on delete restrict,
  sale_id uuid,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  foreign key (group_id, organization_id) references public.livestock_groups(id, organization_id) on delete restrict,
  foreign key (sale_id, organization_id) references public.sales(id, organization_id) on delete restrict,
  unique (organization_id, legacy_firebase_id),
  unique (organization_id, idempotency_key),
  check (jsonb_typeof(payload) = 'object')
);

create index livestock_events_reporting_idx on public.livestock_events (organization_id, event_kind, event_date desc, group_id);

create table public.water_records (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  farm_zone_id uuid references public.farm_zones(id) on delete set null,
  sector_name text not null,
  plot_name text not null,
  crop_name text not null,
  record_date date not null,
  rainfall_mm numeric not null default 0 check (rainfall_mm >= 0),
  et0_mm numeric not null default 0 check (et0_mm >= 0),
  crop_coefficient numeric not null default 1 check (crop_coefficient > 0 and crop_coefficient <= 2),
  irrigation_mm numeric not null default 0 check (irrigation_mm >= 0),
  effective_rainfall_percent numeric not null default 80 check (effective_rainfall_percent between 0 and 100),
  irrigation_efficiency_percent numeric not null default 85 check (irrigation_efficiency_percent > 0 and irrigation_efficiency_percent <= 100),
  trigger_deficit_mm numeric not null default 25 check (trigger_deficit_mm > 0),
  source text not null default 'manual' check (source in ('manual', 'import', 'sensor', 'weather_service')),
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  unique (organization_id, legacy_firebase_id)
);

create index water_records_balance_idx on public.water_records (organization_id, sector_name, plot_name, crop_name, record_date);

create table public.sigatoka_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default true,
  sector_label text not null default 'Sector',
  plot_label text not null default 'Plot',
  plant_label text not null default 'Sentinel plant',
  area_unit text not null default 'hectare',
  custom_area_unit_name text,
  custom_area_square_metres numeric check (custom_area_square_metres is null or custom_area_square_metres > 0),
  sample_plant_count integer not null default 10 check (sample_plant_count > 0),
  initial_fer_baseline numeric not null default 1.17 check (initial_fer_baseline >= 0),
  watch_threshold numeric check (watch_threshold is null or watch_threshold >= 0),
  high_threshold numeric check (high_threshold is null or high_threshold >= 0),
  critical_threshold numeric check (critical_threshold is null or critical_threshold >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  check (high_threshold is null or watch_threshold is null or high_threshold >= watch_threshold),
  check (critical_threshold is null or high_threshold is null or critical_threshold >= high_threshold)
);

create table public.sigatoka_plots (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  farm_zone_id uuid references public.farm_zones(id) on delete set null,
  sector_name text not null,
  name text not null,
  area numeric check (area is null or area >= 0),
  area_square_metres numeric check (area_square_metres is null or area_square_metres >= 0),
  area_unit text,
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  unique (id, organization_id),
  unique (organization_id, sector_name, name),
  unique (organization_id, legacy_firebase_id)
);

create table public.sigatoka_sentinel_plants (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plot_id uuid not null,
  code text not null,
  active boolean not null default true,
  enrolled_on date not null,
  retired_on date,
  retirement_reason text,
  replacement_of uuid references public.sigatoka_sentinel_plants(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  foreign key (plot_id, organization_id) references public.sigatoka_plots(id, organization_id) on delete cascade,
  unique (id, organization_id),
  unique (plot_id, code),
  unique (organization_id, legacy_firebase_id),
  check (retired_on is null or retired_on >= enrolled_on)
);

create table public.sigatoka_observations (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plot_id uuid not null,
  observed_on date not null,
  monitoring_week smallint not null check (monitoring_week between 1 and 53),
  monitoring_year integer not null,
  observer_id uuid not null references auth.users(id) on delete restrict,
  observer_name text not null,
  interval_days numeric not null check (interval_days > 0),
  previous_final_fer numeric not null check (previous_final_fer >= 0),
  mean_raw_fer_override numeric check (mean_raw_fer_override is null or mean_raw_fer_override >= 0),
  status public.record_status not null default 'draft',
  rainfall_mm numeric check (rainfall_mm is null or rainfall_mm >= 0),
  treatment jsonb,
  notes text,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  archive_reason text,
  purge_after timestamptz,
  calculation_version text not null default 'legacy-sed-v1',
  mean_raw_fer numeric not null,
  fer_10d numeric not null,
  final_fer numeric not null,
  coefficient_leaf_2 numeric not null,
  coefficient_leaf_3 numeric not null,
  coefficient_leaf_4 numeric not null,
  gross_coefficient numeric not null,
  sed numeric not null,
  average_yil numeric,
  average_ynl numeric,
  average_nlf numeric,
  average_nlh numeric,
  high_density_count integer not null default 0 check (high_density_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  foreign key (plot_id, organization_id) references public.sigatoka_plots(id, organization_id) on delete restrict,
  unique (id, organization_id),
  unique (organization_id, legacy_firebase_id),
  check (monitoring_year = extract(year from observed_on)::integer or monitoring_year between extract(year from observed_on)::integer - 1 and extract(year from observed_on)::integer + 1),
  check (treatment is null or jsonb_typeof(treatment) = 'object')
);

create index sigatoka_observations_sheet_search_idx
  on public.sigatoka_observations (organization_id, plot_id, monitoring_year, monitoring_week, observed_on desc);

create table public.sigatoka_plant_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  observation_id uuid not null,
  sentinel_plant_id uuid,
  plant_number integer not null check (plant_number > 0),
  previous_leaf_reading numeric not null check (previous_leaf_reading >= 0),
  current_leaf_reading numeric not null check (current_leaf_reading >= 0),
  youngest_infested_leaf numeric,
  youngest_necrotic_leaf numeric,
  leaves_at_flowering numeric,
  leaves_at_harvest numeric,
  notes text,
  foreign key (observation_id, organization_id) references public.sigatoka_observations(id, organization_id) on delete cascade,
  foreign key (sentinel_plant_id, organization_id) references public.sigatoka_sentinel_plants(id, organization_id) on delete restrict,
  unique (id, organization_id),
  unique (observation_id, plant_number),
  check (youngest_infested_leaf is null or youngest_infested_leaf >= 0),
  check (youngest_necrotic_leaf is null or youngest_necrotic_leaf >= 0),
  check (youngest_infested_leaf is null or youngest_necrotic_leaf is null or youngest_infested_leaf <= youngest_necrotic_leaf)
);

create table public.sigatoka_leaf_scores (
  plant_observation_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  leaf_position smallint not null check (leaf_position in (2, 3, 4)),
  disease_stage smallint check (disease_stage between 1 and 6),
  density text check (density in ('low', 'high')),
  coefficient numeric not null default 0 check (coefficient >= 0),
  primary key (plant_observation_id, leaf_position),
  foreign key (plant_observation_id, organization_id) references public.sigatoka_plant_observations(id, organization_id) on delete cascade,
  check ((disease_stage is null) = (density is null))
);

create table public.sigatoka_advanced_stage_counts (
  observation_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sentinel_plant_id uuid not null,
  leaf_number smallint not null check (leaf_number between 5 and 13),
  stage_4_count integer check (stage_4_count is null or stage_4_count >= 0),
  stage_5_count integer check (stage_5_count is null or stage_5_count >= 0),
  stage_6_count integer check (stage_6_count is null or stage_6_count >= 0),
  primary key (observation_id, leaf_number),
  foreign key (observation_id, organization_id) references public.sigatoka_observations(id, organization_id) on delete cascade,
  foreign key (sentinel_plant_id, organization_id) references public.sigatoka_sentinel_plants(id, organization_id) on delete restrict,
  check (
    (stage_4_count is null and stage_5_count is null and stage_6_count is null)
    or (stage_4_count is not null and stage_5_count is not null and stage_6_count is not null)
  )
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  legacy_firebase_id text,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  alert_type text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  title text not null,
  message text not null,
  entity_type text,
  entity_id uuid,
  action_url text,
  action_required boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, legacy_firebase_id)
);

create index alerts_unread_idx on public.alerts (organization_id, created_at desc) where read_at is null;

create table public.deletion_audit (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  legacy_entity_id text,
  action text not null check (action in ('archive', 'restore', 'permanent_delete', 'void', 'correction')),
  reason text,
  performed_by uuid not null references auth.users(id) on delete restrict,
  performed_at timestamptz not null default now(),
  snapshot jsonb
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  request_id text,
  old_record jsonb,
  new_record jsonb,
  occurred_at timestamptz not null default now()
);

create index audit_events_entity_idx on public.audit_events (organization_id, entity_type, entity_id, occurred_at desc);

commit;
