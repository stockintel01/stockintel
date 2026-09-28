begin;

alter table public.packing_records
  add column details jsonb not null default '{}'::jsonb,
  add constraint packing_records_details_object check (jsonb_typeof(details) = 'object');

alter table public.shipments
  add column details jsonb not null default '{}'::jsonb,
  add constraint shipments_details_object check (jsonb_typeof(details) = 'object');

drop index if exists public.sales_shipment_unique_idx;
create unique index sales_shipment_unique_idx on public.sales (shipment_id) where shipment_id is not null;

-- Export records are created before inspection. The standard becomes mandatory as
-- soon as quality work starts, and create_shipment already refuses an export lot
-- whose immutable standard snapshot is empty.
alter table public.packing_records drop constraint if exists packing_records_export_standard_check;
alter table public.packing_records
  add constraint packing_records_export_standard_check
  check (
    market <> 'export'
    or inspection_status = 'awaiting_inspection'
    or quality_standard_snapshot <> '{}'::jsonb
  );

create or replace function app_private.protect_packing_record_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.inspected_packages > 0 then
    raise exception 'Inspected packing history cannot be deleted; record an audited correction.' using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' and old.inspected_packages > 0 and (
    new.packed_on is distinct from old.packed_on
    or new.station_id is distinct from old.station_id
    or new.supervisor_id is distinct from old.supervisor_id
    or new.farm_zone_id is distinct from old.farm_zone_id
    or new.produce is distinct from old.produce
    or new.market is distinct from old.market
    or new.destination_country is distinct from old.destination_country
    or new.target_packages is distinct from old.target_packages
    or new.packed_packages is distinct from old.packed_packages
    or new.shift is distinct from old.shift
    or new.fulfilment_plan_id is distinct from old.fulfilment_plan_id
    or new.fulfilment_occurrence_date is distinct from old.fulfilment_occurrence_date
  ) then
    raise exception 'Operational fields are locked after quality inspection begins.' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger protect_packing_record_history_before_write
  before update or delete on public.packing_records
  for each row execute function app_private.protect_packing_record_history();

create or replace function public.record_packing_quality_event_with_details(
  p_packing_record_id uuid,
  p_event_type public.quality_event_type,
  p_inspected_delta numeric,
  p_accepted_delta numeric,
  p_rejected_delta numeric,
  p_rework_delta numeric,
  p_confirmed_checks text[] default array[]::text[],
  p_reason text default null,
  p_notes text default null,
  p_inspected_at timestamptz default now(),
  p_correction_of uuid default null,
  p_idempotency_key text default null,
  p_package_type text default null,
  p_package_size text default null,
  p_quality_grade text default null,
  p_lot_number text default null,
  p_pallet_id text default null,
  p_storage_location text default null,
  p_market public.market_scope default null,
  p_destination_country text default null,
  p_quality_standard_id uuid default null,
  p_quality_standard_snapshot jsonb default '{}'::jsonb,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  if jsonb_typeof(coalesce(p_quality_standard_snapshot, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_details, '{}'::jsonb)) <> 'object' then
    raise exception 'Packing quality details must be JSON objects.' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.packing_records record
    where record.id = p_packing_record_id
      and app_private.subscription_is_active(record.organization_id)
      and app_private.has_any_permission(record.organization_id, array['agricPacking']::public.app_permission[])
  ) then
    raise exception 'You do not have permission to record quality inspections.' using errcode = '42501';
  end if;

  update public.packing_records record
  set package_type = coalesce(nullif(btrim(p_package_type), ''), record.package_type),
      package_size = nullif(btrim(coalesce(p_package_size, '')), ''),
      quality_grade = nullif(btrim(coalesce(p_quality_grade, '')), ''),
      lot_number = coalesce(nullif(btrim(p_lot_number), ''), record.lot_number),
      pallet_id = nullif(btrim(coalesce(p_pallet_id, '')), ''),
      storage_location = nullif(btrim(coalesce(p_storage_location, '')), ''),
      market = coalesce(p_market, record.market),
      destination_country = nullif(btrim(coalesce(p_destination_country, '')), ''),
      quality_standard_id = p_quality_standard_id,
      quality_standard_snapshot = coalesce(p_quality_standard_snapshot, '{}'::jsonb),
      details = record.details || coalesce(p_details, '{}'::jsonb)
  where record.id = p_packing_record_id;

  if not found then raise exception 'Packing record not found.' using errcode = 'P0002'; end if;

  v_event_id := public.record_packing_quality_event(
    p_packing_record_id,
    p_event_type,
    p_inspected_delta,
    p_accepted_delta,
    p_rejected_delta,
    p_rework_delta,
    p_confirmed_checks,
    p_reason,
    p_notes,
    p_inspected_at,
    p_correction_of,
    p_idempotency_key
  );
  return v_event_id;
end;
$$;

create or replace function public.create_packhouse_dispatch(
  p_organization_id uuid,
  p_allocations jsonb,
  p_destination_name text,
  p_market public.market_scope,
  p_produce text,
  p_dispatched_at timestamptz default now(),
  p_station_id uuid default null,
  p_destination_country text default null,
  p_transport_profile_id uuid default null,
  p_vehicle_identifier text default null,
  p_driver_name text default null,
  p_weight_shipped_kg numeric default null,
  p_notes text default null,
  p_details jsonb default '{}'::jsonb,
  p_sale jsonb default null,
  p_receipt_settings jsonb default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shipment_id uuid;
  v_customer_id uuid;
  v_sale_id uuid;
  v_sale_number text;
  v_receipt jsonb;
  v_packages numeric;
  v_unit_price numeric;
  v_subtotal numeric;
  v_discount numeric;
  v_tax_rate numeric;
  v_tax numeric;
  v_total numeric;
  v_amount_paid numeric;
  v_currency text;
  v_payment_method text;
begin
  if jsonb_typeof(coalesce(p_details, '{}'::jsonb)) <> 'object'
    or (p_sale is not null and jsonb_typeof(p_sale) <> 'object')
    or (p_receipt_settings is not null and jsonb_typeof(p_receipt_settings) <> 'object') then
    raise exception 'Dispatch, sale and receipt details must be JSON objects.' using errcode = '22023';
  end if;
  if p_sale is not null and not app_private.can_manage_org(p_organization_id) then
    raise exception 'Only an owner or manager can create a customer sale.' using errcode = '42501';
  end if;

  if p_sale is not null then
    select customer.id into v_customer_id
    from public.customers customer
    where customer.organization_id = p_organization_id
      and customer.active
      and lower(customer.name) = lower(btrim(p_destination_name))
    order by customer.created_at
    limit 1;

    if v_customer_id is null then
      insert into public.customers (
        organization_id, name, phone, address, destination_country, default_currency, created_by
      ) values (
        p_organization_id,
        btrim(p_destination_name),
        nullif(btrim(p_sale ->> 'customerContact'), ''),
        nullif(btrim(p_sale ->> 'customerAddress'), ''),
        nullif(btrim(coalesce(p_destination_country, '')), ''),
        upper(coalesce(nullif(btrim(p_sale ->> 'currency'), ''), 'GHS')),
        (select auth.uid())
      ) returning id into v_customer_id;
    end if;
  end if;

  v_shipment_id := public.create_shipment(
    p_organization_id,
    p_allocations,
    p_destination_name,
    p_market,
    p_produce,
    p_dispatched_at,
    p_station_id,
    v_customer_id,
    p_destination_country,
    p_transport_profile_id,
    p_vehicle_identifier,
    p_driver_name,
    p_weight_shipped_kg,
    p_notes,
    p_idempotency_key
  );

  update public.shipments
  set details = details || coalesce(p_details, '{}'::jsonb)
  where id = v_shipment_id;

  if p_sale is null then
    return jsonb_build_object('shipmentId', v_shipment_id);
  end if;

  select sale.id into v_sale_id from public.sales sale where sale.shipment_id = v_shipment_id;
  if v_sale_id is null then
    select shipment.packages_shipped into v_packages from public.shipments shipment where shipment.id = v_shipment_id;
    v_unit_price := greatest(coalesce(nullif(p_sale ->> 'unitPricePerBox', '')::numeric, 0), 0);
    if v_unit_price <= 0 then raise exception 'A selling price above zero is required.' using errcode = '22023'; end if;
    v_subtotal := round(v_packages * v_unit_price, 2);
    v_discount := least(v_subtotal, greatest(coalesce(nullif(p_sale ->> 'discountAmount', '')::numeric, 0), 0));
    v_tax_rate := least(100, greatest(coalesce(nullif(p_sale ->> 'taxRate', '')::numeric, 0), 0));
    v_tax := round((v_subtotal - v_discount) * v_tax_rate / 100, 2);
    v_total := v_subtotal - v_discount + v_tax;
    v_currency := upper(coalesce(nullif(btrim(p_sale ->> 'currency'), ''), 'GHS'));
    if v_currency !~ '^[A-Z]{3}$' then raise exception 'A valid ISO currency code is required.' using errcode = '22023'; end if;
    v_sale_number := app_private.next_document_number(p_organization_id, 'sale', 'SAL');

    insert into public.sales (
      organization_id, sale_number, shipment_id, customer_id, sold_at, currency,
      subtotal, discount_amount, tax_rate, tax_amount, total_amount, amount_paid,
      payment_status, notes, sold_by
    ) values (
      p_organization_id, v_sale_number, v_shipment_id, v_customer_id, p_dispatched_at, v_currency,
      v_subtotal, v_discount, v_tax_rate, v_tax, v_total, 0,
      'unpaid', p_notes, (select auth.uid())
    ) returning id into v_sale_id;

    insert into public.sale_items (
      organization_id, sale_id, description, quantity, unit_price, metadata
    ) values (
      p_organization_id, v_sale_id, btrim(p_produce) || ' produce', v_packages, v_unit_price,
      jsonb_build_object('unit', 'boxes', 'shipmentId', v_shipment_id)
    );

    v_amount_paid := least(v_total, greatest(coalesce(nullif(p_sale ->> 'amountPaid', '')::numeric, 0), 0));
    v_payment_method := coalesce(nullif(btrim(p_sale ->> 'paymentMethod'), ''), 'cash');
    if v_amount_paid > 0 then
      perform public.record_sale_payment(
        v_sale_id,
        v_amount_paid,
        v_payment_method,
        p_dispatched_at,
        nullif(btrim(p_sale ->> 'invoiceNumber'), ''),
        case when p_idempotency_key is null then null else 'sale-payment:' || p_idempotency_key end,
        null
      );
    end if;
  end if;

  if p_receipt_settings is not null then
    v_receipt := public.issue_sales_receipt(v_sale_id, p_receipt_settings, null);
  end if;

  update public.shipments
  set details = details || jsonb_build_object('saleId', v_sale_id, 'receipt', coalesce(v_receipt, '{}'::jsonb))
  where id = v_shipment_id;

  return jsonb_build_object(
    'shipmentId', v_shipment_id,
    'saleId', v_sale_id,
    'receipt', v_receipt
  );
end;
$$;

create or replace function public.delete_uninspected_packing_record(p_packing_record_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.packing_records%rowtype;
begin
  select * into v_record
  from public.packing_records
  where id = p_packing_record_id
  for update;
  if not found then raise exception 'Packing record not found.' using errcode = 'P0002'; end if;
  if not app_private.can_manage_org(v_record.organization_id) then
    raise exception 'Only an owner or manager can delete a packing record.' using errcode = '42501';
  end if;
  if v_record.inspected_packages > 0 or exists (
    select 1 from public.shipment_allocations allocation
    where allocation.packing_record_id = v_record.id
  ) then
    raise exception 'Inspected or shipped packing history cannot be deleted; record an audited correction instead.' using errcode = '55000';
  end if;
  delete from public.packing_records where id = v_record.id;
end;
$$;

revoke all on function public.record_packing_quality_event_with_details(
  uuid, public.quality_event_type, numeric, numeric, numeric, numeric, text[], text, text,
  timestamptz, uuid, text, text, text, text, text, text, text, public.market_scope,
  text, uuid, jsonb, jsonb
) from public, anon;
revoke all on function public.create_packhouse_dispatch(
  uuid, jsonb, text, public.market_scope, text, timestamptz, uuid, text, uuid,
  text, text, numeric, text, jsonb, jsonb, jsonb, text
) from public, anon;
revoke all on function public.delete_uninspected_packing_record(uuid) from public, anon;
grant execute on function public.record_packing_quality_event_with_details(
  uuid, public.quality_event_type, numeric, numeric, numeric, numeric, text[], text, text,
  timestamptz, uuid, text, text, text, text, text, text, public.market_scope,
  text, uuid, jsonb, jsonb
) to authenticated;
grant execute on function public.create_packhouse_dispatch(
  uuid, jsonb, text, public.market_scope, text, timestamptz, uuid, text, uuid,
  text, text, numeric, text, jsonb, jsonb, jsonb, text
) to authenticated;
grant execute on function public.delete_uninspected_packing_record(uuid) to authenticated;

do $$
declare
  publication_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  foreach publication_table in array array[
    'organizations', 'farm_profiles', 'farm_locations', 'farm_zones', 'crop_plans',
    'packing_stations', 'packing_station_members', 'packing_crew_profiles',
    'packing_crew_members', 'transport_profiles', 'packing_fulfilment_plans',
    'packing_quality_events', 'shipment_allocations', 'sales', 'sale_items',
    'sale_payments', 'sales_receipts'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = publication_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', publication_table);
    end if;
  end loop;
end;
$$;

commit;
