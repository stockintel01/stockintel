begin;

alter table public.inventory_items add column idempotency_key text;
alter table public.equipment_checkouts add column idempotency_key text;
alter table public.spray_plans add column idempotency_key text;
create unique index inventory_items_idempotency_idx on public.inventory_items (organization_id, idempotency_key) where idempotency_key is not null;
create unique index equipment_checkouts_idempotency_idx on public.equipment_checkouts (organization_id, idempotency_key) where idempotency_key is not null;
create unique index spray_plans_idempotency_idx on public.spray_plans (organization_id, idempotency_key) where idempotency_key is not null;

alter table public.stock_issues
  add column received_at timestamptz,
  add column received_by uuid references auth.users(id) on delete set null;

create or replace function public.create_inventory_item(
  p_organization_id uuid,
  p_name text,
  p_category public.inventory_category,
  p_stock_unit_id uuid,
  p_initial_quantity numeric default 0,
  p_chemical_component text default null,
  p_pack_description text default null,
  p_minimum_stock numeric default 0,
  p_reorder_alert_days integer default 7,
  p_supplier_name text default null,
  p_unit_cost numeric default null,
  p_storage_location text default null,
  p_average_weekly_usage numeric default null,
  p_received_on date default current_date,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item_id uuid;
begin
  if not app_private.subscription_is_active(p_organization_id)
    or not app_private.has_any_permission(p_organization_id, array['agricStock']::public.app_permission[]) then
    raise exception 'You do not have permission to create inventory items.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) < 1 or coalesce(p_initial_quantity, 0) < 0 then
    raise exception 'Item name and a non-negative opening quantity are required.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.units_of_measure unit
    where unit.id = p_stock_unit_id and unit.active
      and (unit.organization_id is null or unit.organization_id = p_organization_id)
  ) then
    raise exception 'The selected stock unit is unavailable.' using errcode = '23503';
  end if;

  if p_idempotency_key is not null then
    select item.id into v_item_id from public.inventory_items item
    where item.organization_id = p_organization_id and item.idempotency_key = p_idempotency_key;
    if v_item_id is not null then return v_item_id; end if;
  end if;

  insert into public.inventory_items (
    organization_id, name, chemical_component, category, stock_unit_id,
    pack_description, minimum_stock, reorder_alert_days, supplier_name,
    unit_cost, storage_location, average_weekly_usage, last_received_on,
    last_received_quantity, created_by, idempotency_key
  ) values (
    p_organization_id, btrim(p_name), nullif(btrim(coalesce(p_chemical_component, '')), ''), p_category, p_stock_unit_id,
    nullif(btrim(coalesce(p_pack_description, '')), ''), greatest(coalesce(p_minimum_stock, 0), 0),
    greatest(coalesce(p_reorder_alert_days, 0), 0), nullif(btrim(coalesce(p_supplier_name, '')), ''),
    p_unit_cost, nullif(btrim(coalesce(p_storage_location, '')), ''), p_average_weekly_usage,
    case when p_initial_quantity > 0 then p_received_on end,
    case when p_initial_quantity > 0 then p_initial_quantity end,
    (select auth.uid()), p_idempotency_key
  ) returning id into v_item_id;

  if p_initial_quantity > 0 then
    perform public.receive_inventory_stock(
      p_organization_id, v_item_id, p_initial_quantity, p_stock_unit_id,
      p_received_on::timestamptz, p_unit_cost, 'opening_balance', null,
      'Opening balance', case when p_idempotency_key is null then null else 'opening:' || p_idempotency_key end, true
    );
  end if;
  return v_item_id;
end;
$$;

create or replace function public.archive_inventory_item(p_item_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.inventory_items%rowtype;
begin
  select * into v_item from public.inventory_items where id = p_item_id for update;
  if not found then raise exception 'Inventory item not found.' using errcode = 'P0002'; end if;
  if not app_private.can_manage_org(v_item.organization_id) then
    raise exception 'Only an owner or manager can archive inventory.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Explain why this item is being archived.' using errcode = '22023';
  end if;
  update public.inventory_items
  set active = false, archived_at = now(), archived_by = (select auth.uid()), archive_reason = btrim(p_reason)
  where id = v_item.id;
  perform public.record_deletion_audit(
    v_item.organization_id, 'inventory_item', 'archive', v_item.id, null,
    p_reason, to_jsonb(v_item) - 'legacy_firebase_id'
  );
end;
$$;

create or replace function public.confirm_stock_request_receipt(
  p_request_id uuid,
  p_idempotency_key text default null
)
returns public.request_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.stock_requests%rowtype;
  v_has_unfulfilled boolean;
  v_status public.request_status;
begin
  select * into v_request from public.stock_requests where id = p_request_id for update;
  if not found then raise exception 'Stock request not found.' using errcode = 'P0002'; end if;
  if v_request.requested_by <> (select auth.uid()) and not app_private.can_approve_requests(v_request.organization_id) then
    raise exception 'Only the requester or an authorized manager can confirm receipt.' using errcode = '42501';
  end if;
  if v_request.status not in ('partially_fulfilled', 'dispatched', 'received') then
    raise exception 'There are no dispatched quantities awaiting receipt.' using errcode = '23514';
  end if;
  if p_idempotency_key is not null and exists (
    select 1 from public.stock_request_events event
    where event.organization_id = v_request.organization_id and event.idempotency_key = p_idempotency_key
  ) then return v_request.status; end if;

  update public.stock_issues
  set received_at = coalesce(received_at, now()), received_by = coalesce(received_by, (select auth.uid()))
  where request_id = v_request.id and received_at is null;
  select exists (
    select 1 from public.stock_request_items item
    where item.request_id = v_request.id
      and item.requested_quantity_in_stock_unit > (
        select coalesce(sum(issue.quantity), 0) from public.stock_issues issue where issue.request_item_id = item.id
      )
  ) into v_has_unfulfilled;
  v_status := case when v_has_unfulfilled then 'partially_fulfilled'::public.request_status else 'received'::public.request_status end;
  update public.stock_requests set status = v_status where id = v_request.id;
  insert into public.stock_request_events (organization_id, request_id, event_type, actor_id, details, idempotency_key)
  values (
    v_request.organization_id, v_request.id, 'receipt_confirmed', (select auth.uid()),
    jsonb_build_object('status', v_status), p_idempotency_key
  );
  return v_status;
end;
$$;

-- Receipt confirmation and later consumption are separate farm events. Once the
-- requester confirms a complete dispatch, recording daily usage must not reopen the
-- request as though the stock were still waiting at the store.
create or replace function app_private.refresh_stock_request_status(target_request_id uuid)
returns public.request_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_record public.stock_requests%rowtype;
  has_unfulfilled boolean;
  has_unresolved boolean;
  next_status public.request_status;
begin
  select * into request_record from public.stock_requests where id = target_request_id for update;
  if not found then raise exception 'Stock request not found.' using errcode = 'P0002'; end if;
  select exists (
    select 1 from public.stock_request_items item
    where item.request_id = request_record.id
      and item.requested_quantity_in_stock_unit > (
        select coalesce(sum(issue.quantity), 0) from public.stock_issues issue where issue.request_item_id = item.id
      )
  ) into has_unfulfilled;
  if has_unfulfilled then
    next_status := case
      when exists (select 1 from public.stock_issues issue where issue.request_id = request_record.id)
        then 'partially_fulfilled'::public.request_status
      else 'approved'::public.request_status
    end;
  else
    select exists (
      select 1 from public.stock_issues issue
      where issue.request_id = request_record.id
        and (
          (issue.mode = 'consumable' and issue.quantity > (
            select coalesce(sum(log.quantity_in_stock_unit), 0) from public.usage_logs log where log.issue_id = issue.id
          ))
          or
          (issue.mode = 'returnable' and issue.quantity > (
            select coalesce(sum(return_record.quantity), 0) from public.stock_issue_returns return_record where return_record.issue_id = issue.id
          ))
        )
    ) into has_unresolved;
    next_status := case
      when not has_unresolved then 'closed'::public.request_status
      when request_record.status = 'received' then 'received'::public.request_status
      else 'dispatched'::public.request_status
    end;
  end if;
  update public.stock_requests
  set status = next_status, closed_at = case when next_status = 'closed' then coalesce(closed_at, now()) else null end
  where id = request_record.id;
  return next_status;
end;
$$;

create or replace function public.create_equipment_checkout(
  p_organization_id uuid,
  p_inventory_item_id uuid,
  p_item_name text,
  p_checked_out_to_name text,
  p_checked_out_at timestamptz,
  p_expected_return_at timestamptz default null,
  p_farm_zone_id uuid default null,
  p_purpose text default null,
  p_notes text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset_id uuid;
  v_checkout_id uuid;
begin
  if not app_private.subscription_is_active(p_organization_id)
    or not app_private.has_any_permission(p_organization_id, array['agricEquipment']::public.app_permission[]) then
    raise exception 'You do not have permission to check out equipment.' using errcode = '42501';
  end if;
  if p_idempotency_key is not null then
    select checkout.id into v_checkout_id from public.equipment_checkouts checkout
    where checkout.organization_id = p_organization_id and checkout.idempotency_key = p_idempotency_key;
    if v_checkout_id is not null then return v_checkout_id; end if;
  end if;
  select asset.id into v_asset_id
  from public.equipment_assets asset
  where asset.organization_id = p_organization_id
    and asset.inventory_item_id = p_inventory_item_id
    and asset.active
    and not exists (select 1 from public.equipment_checkouts open_checkout where open_checkout.asset_id = asset.id and open_checkout.returned_at is null)
  order by asset.created_at
  limit 1
  for update skip locked;
  if v_asset_id is null then
    insert into public.equipment_assets (
      organization_id, inventory_item_id, asset_code, name, created_by
    ) values (
      p_organization_id, p_inventory_item_id,
      'AUTO-' || upper(left(replace(p_inventory_item_id::text, '-', ''), 8)) || '-' || upper(left(gen_random_uuid()::text, 6)),
      btrim(p_item_name), (select auth.uid())
    ) returning id into v_asset_id;
  end if;
  insert into public.equipment_checkouts (
    organization_id, asset_id, checked_out_to_name, checked_out_by,
    checked_out_at, expected_return_at, farm_zone_id, purpose, notes, idempotency_key
  ) values (
    p_organization_id, v_asset_id, btrim(p_checked_out_to_name), (select auth.uid()),
    p_checked_out_at, p_expected_return_at, p_farm_zone_id,
    nullif(btrim(coalesce(p_purpose, '')), ''), nullif(btrim(coalesce(p_notes, '')), ''), p_idempotency_key
  ) returning id into v_checkout_id;
  return v_checkout_id;
end;
$$;

create or replace function public.return_equipment_checkout(
  p_checkout_id uuid,
  p_condition public.equipment_condition,
  p_notes text default null,
  p_returned_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_checkout public.equipment_checkouts%rowtype;
begin
  select * into v_checkout from public.equipment_checkouts where id = p_checkout_id for update;
  if not found then raise exception 'Equipment checkout not found.' using errcode = 'P0002'; end if;
  if not app_private.subscription_is_active(v_checkout.organization_id)
    or not app_private.has_any_permission(v_checkout.organization_id, array['agricEquipment']::public.app_permission[]) then
    raise exception 'You do not have permission to return equipment.' using errcode = '42501';
  end if;
  if v_checkout.returned_at is not null then raise exception 'This equipment has already been returned.' using errcode = '23514'; end if;
  update public.equipment_checkouts
  set returned_at = p_returned_at, returned_condition = p_condition,
      notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), notes)
  where id = v_checkout.id;
  update public.equipment_assets set current_condition = p_condition where id = v_checkout.asset_id;
end;
$$;

create or replace function public.create_spray_plan(
  p_organization_id uuid,
  p_name text,
  p_farm_zone_id uuid,
  p_cycle text,
  p_start_date date,
  p_end_date date,
  p_total_applications integer,
  p_items jsonb,
  p_notes text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_id uuid;
  v_item jsonb;
  v_item_id uuid;
  v_unit_id uuid;
  v_quantity numeric;
begin
  if not app_private.subscription_is_active(p_organization_id)
    or not app_private.has_any_permission(p_organization_id, array['agricPlanner']::public.app_permission[]) then
    raise exception 'You do not have permission to create spray plans.' using errcode = '42501';
  end if;
  if p_cycle not in ('weekly', 'biweekly', 'monthly', 'custom') or p_end_date < p_start_date
    or p_total_applications < 1 or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'The spray plan dates, cycle, applications or materials are invalid.' using errcode = '22023';
  end if;
  if p_idempotency_key is not null then
    select plan.id into v_plan_id from public.spray_plans plan
    where plan.organization_id = p_organization_id and plan.idempotency_key = p_idempotency_key;
    if v_plan_id is not null then return v_plan_id; end if;
  end if;
  insert into public.spray_plans (
    organization_id, name, farm_zone_id, cycle, start_date, end_date,
    total_applications, status, notes, created_by, idempotency_key
  ) values (
    p_organization_id, btrim(p_name), p_farm_zone_id, p_cycle, p_start_date, p_end_date,
    p_total_applications, 'active', nullif(btrim(coalesce(p_notes, '')), ''), (select auth.uid()), p_idempotency_key
  ) returning id into v_plan_id;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_id := nullif(v_item ->> 'item_id', '')::uuid;
    v_unit_id := nullif(v_item ->> 'unit_id', '')::uuid;
    v_quantity := nullif(v_item ->> 'quantity_per_application', '')::numeric;
    insert into public.spray_plan_items (
      organization_id, plan_id, item_id, quantity_per_application,
      requested_unit_id, quantity_per_application_in_stock_unit, restock_required_by
    ) values (
      p_organization_id, v_plan_id, v_item_id, v_quantity, v_unit_id,
      app_private.to_stock_quantity(p_organization_id, v_item_id, v_unit_id, v_quantity),
      nullif(v_item ->> 'restock_required_by', '')::date
    );
  end loop;
  return v_plan_id;
end;
$$;

create or replace function public.record_spray_application(
  p_plan_id uuid,
  p_applied_at timestamptz,
  p_notes text default null,
  p_idempotency_key text default null
)
returns public.plan_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.spray_plans%rowtype;
  v_completed bigint;
  v_status public.plan_status;
begin
  select * into v_plan from public.spray_plans where id = p_plan_id for update;
  if not found then raise exception 'Spray plan not found.' using errcode = 'P0002'; end if;
  if not app_private.subscription_is_active(v_plan.organization_id)
    or not app_private.has_any_permission(v_plan.organization_id, array['agricPlanner']::public.app_permission[]) then
    raise exception 'You do not have permission to update this spray plan.' using errcode = '42501';
  end if;
  if p_idempotency_key is not null and exists (
    select 1 from public.spray_applications application
    where application.organization_id = v_plan.organization_id and application.idempotency_key = p_idempotency_key
  ) then return v_plan.status; end if;
  if v_plan.status <> 'active' then raise exception 'Only active spray plans can be updated.' using errcode = '23514'; end if;
  select count(*) into v_completed from public.spray_applications application where application.plan_id = v_plan.id;
  if v_completed >= v_plan.total_applications then raise exception 'All planned applications are already recorded.' using errcode = '23514'; end if;
  insert into public.spray_applications (organization_id, plan_id, applied_at, notes, recorded_by, idempotency_key)
  values (v_plan.organization_id, v_plan.id, p_applied_at, nullif(btrim(coalesce(p_notes, '')), ''), (select auth.uid()), p_idempotency_key);
  v_status := case when v_completed + 1 >= v_plan.total_applications then 'completed'::public.plan_status else 'active'::public.plan_status end;
  update public.spray_plans set status = v_status where id = v_plan.id;
  return v_status;
end;
$$;

revoke all on function public.create_inventory_item(uuid, text, public.inventory_category, uuid, numeric, text, text, numeric, integer, text, numeric, text, numeric, date, text) from public, anon;
revoke all on function public.archive_inventory_item(uuid, text) from public, anon;
revoke all on function public.confirm_stock_request_receipt(uuid, text) from public, anon;
revoke all on function public.create_equipment_checkout(uuid, uuid, text, text, timestamptz, timestamptz, uuid, text, text, text) from public, anon;
revoke all on function public.return_equipment_checkout(uuid, public.equipment_condition, text, timestamptz) from public, anon;
revoke all on function public.create_spray_plan(uuid, text, uuid, text, date, date, integer, jsonb, text, text) from public, anon;
revoke all on function public.record_spray_application(uuid, timestamptz, text, text) from public, anon;

grant execute on function public.create_inventory_item(uuid, text, public.inventory_category, uuid, numeric, text, text, numeric, integer, text, numeric, text, numeric, date, text) to authenticated;
grant execute on function public.archive_inventory_item(uuid, text) to authenticated;
grant execute on function public.confirm_stock_request_receipt(uuid, text) to authenticated;
grant execute on function public.create_equipment_checkout(uuid, uuid, text, text, timestamptz, timestamptz, uuid, text, text, text) to authenticated;
grant execute on function public.return_equipment_checkout(uuid, public.equipment_condition, text, timestamptz) to authenticated;
grant execute on function public.create_spray_plan(uuid, text, uuid, text, date, date, integer, jsonb, text, text) to authenticated;
grant execute on function public.record_spray_application(uuid, timestamptz, text, text) to authenticated;

commit;
