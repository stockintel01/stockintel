begin;

create or replace function app_private.current_email()
returns extensions.citext
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'email', '')::extensions.citext
$$;

create or replace function app_private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.platform_admins administrator
    where administrator.active
      and (
        administrator.user_id = (select auth.uid())
        or administrator.email = app_private.current_email()
      )
  )
$$;

create or replace function app_private.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.is_platform_admin() or exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.user_id = (select auth.uid())
      and membership.active
  )
$$;

create or replace function app_private.membership_role(target_organization_id uuid)
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select membership.role
  from public.organization_memberships membership
  where membership.organization_id = target_organization_id
    and membership.user_id = (select auth.uid())
    and membership.active
  limit 1
$$;

create or replace function app_private.has_any_permission(
  target_organization_id uuid,
  required_permissions public.app_permission[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.is_platform_admin() or exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.user_id = (select auth.uid())
      and membership.active
      and (
        membership.role = 'owner'
        or membership.permissions && required_permissions
      )
  )
$$;

create or replace function app_private.can_manage_org(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.is_platform_admin() or exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.user_id = (select auth.uid())
      and membership.active
      and (
        membership.role = 'owner'
        or (membership.role = 'manager' and 'team'::public.app_permission = any(membership.permissions))
      )
  )
$$;

create or replace function app_private.subscription_is_active(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.is_platform_admin() or exists (
    select 1
    from public.organization_subscriptions subscription
    where subscription.organization_id = target_organization_id
      and subscription.status in ('trialing', 'active')
      and (
        subscription.plan_id <> 'free_trial'
        or subscription.trial_ends_at is null
        or subscription.trial_ends_at > now()
      )
      and (
        subscription.current_period_end is null
        or subscription.current_period_end > now()
      )
  )
$$;

create or replace function app_private.entitlement_limit(
  target_organization_id uuid,
  target_feature_key text
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when app_private.is_platform_admin() then null
    when subscription.override_limits ? target_feature_key
      then nullif(subscription.override_limits ->> target_feature_key, '')::numeric
    else entitlement.limit_value
  end
  from public.organization_subscriptions subscription
  join public.plan_entitlements entitlement
    on entitlement.plan_id = subscription.plan_id
   and entitlement.feature_key = target_feature_key
  where subscription.organization_id = target_organization_id
    and entitlement.enabled
  limit 1
$$;

create or replace function app_private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function app_private.touch_updated_at_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.revision := old.revision + 1;
  return new;
end;
$$;

create or replace function app_private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null then
    insert into public.profiles (id, email, display_name, photo_url)
    values (
      new.id,
      new.email,
      coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
      nullif(new.raw_user_meta_data ->> 'avatar_url', '')
    )
    on conflict (id) do update
      set email = excluded.email,
          display_name = coalesce(nullif(public.profiles.display_name, ''), excluded.display_name),
          photo_url = coalesce(public.profiles.photo_url, excluded.photo_url),
          updated_at = now();

    update public.platform_admins
    set user_id = new.id,
        updated_at = now()
    where email = new.email::extensions.citext
      and user_id is null;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function app_private.handle_new_auth_user();

create or replace function app_private.initialize_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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
    new.id, 'free_trial', 'trialing', 'internal', now() + interval '14 days', now(), now() + interval '14 days'
  )
  on conflict (organization_id) do nothing;

  update public.profiles
  set default_organization_id = coalesce(default_organization_id, new.id), updated_at = now()
  where id = new.owner_id;

  return new;
end;
$$;

drop trigger if exists initialize_organization_after_insert on public.organizations;
create trigger initialize_organization_after_insert
  after insert on public.organizations
  for each row execute function app_private.initialize_organization();

create or replace function app_private.initialize_inventory_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inventory_balances (item_id, organization_id, quantity)
  values (new.id, new.organization_id, 0)
  on conflict (item_id) do nothing;
  return new;
end;
$$;

drop trigger if exists initialize_inventory_balance_after_insert on public.inventory_items;
create trigger initialize_inventory_balance_after_insert
  after insert on public.inventory_items
  for each row execute function app_private.initialize_inventory_balance();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations', 'organization_memberships', 'invitations', 'role_templates',
    'organization_subscriptions', 'farm_profiles', 'farm_locations', 'farm_zones',
    'inventory_items', 'inventory_balances', 'stock_adjustments', 'stock_requests',
    'stock_issues', 'usage_logs', 'equipment_assets', 'equipment_checkouts',
    'spray_plans', 'packing_stations', 'packing_quality_standards',
    'packing_crew_profiles', 'transport_profiles', 'customers',
    'packing_fulfilment_plans', 'packing_records', 'shipments', 'sales',
    'expense_categories', 'expense_budgets', 'expenses', 'crop_plans',
    'livestock_pens', 'livestock_groups', 'livestock_events', 'water_records',
    'sigatoka_settings', 'sigatoka_plots', 'sigatoka_sentinel_plants',
    'sigatoka_observations'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function app_private.touch_updated_at_revision()',
      'touch_' || table_name,
      table_name
    );
  end loop;

  foreach table_name in array array[
    'platform_admins', 'profiles', 'plans', 'plan_entitlements', 'plan_prices',
    'usage_period_counters', 'units_of_measure', 'inventory_item_units',
    'spray_plan_items', 'document_sequences'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function app_private.touch_updated_at()',
      'touch_' || table_name,
      table_name
    );
  end loop;
end;
$$;

create or replace function app_private.protect_profile_security_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.is_platform_admin() then
    if new.id <> old.id
      or new.email <> old.email
      or new.legacy_firebase_uid is distinct from old.legacy_firebase_uid then
      raise exception 'Profile identity fields cannot be changed.' using errcode = '42501';
    end if;
    if new.default_organization_id is not null
      and not app_private.is_org_member(new.default_organization_id) then
      raise exception 'You cannot switch to an organization you do not belong to.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_profile_security_fields_before_update
  before update on public.profiles
  for each row execute function app_private.protect_profile_security_fields();

create or replace function app_private.protect_organization_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.is_platform_admin() and (
    new.id <> old.id
    or new.owner_id <> old.owner_id
    or new.industry <> old.industry
    or new.referral_code <> old.referral_code
    or new.legacy_firebase_id is distinct from old.legacy_firebase_id
  ) then
    raise exception 'Organization identity fields can only be changed by a platform administrator.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger protect_organization_identity_before_update
  before update on public.organizations
  for each row execute function app_private.protect_organization_identity();

create or replace function app_private.prevent_immutable_event_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% records are immutable; create a reversal or correction instead.', tg_table_name
    using errcode = '55000';
  return old;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'inventory_movements', 'stock_issue_returns', 'stock_request_events',
    'packing_quality_events', 'sale_payments', 'sales_receipts',
    'deletion_audit', 'audit_events'
  ] loop
    execute format(
      'create trigger %I before update or delete on public.%I for each row execute function app_private.prevent_immutable_event_change()',
      'immutable_' || table_name,
      table_name
    );
  end loop;
end;
$$;

create or replace function public.record_inventory_movement(
  p_organization_id uuid,
  p_item_id uuid,
  p_movement_type public.inventory_movement_type,
  p_quantity_delta numeric,
  p_occurred_at timestamptz,
  p_original_quantity numeric default null,
  p_original_unit_id uuid default null,
  p_unit_cost numeric default null,
  p_farm_zone_id uuid default null,
  p_source_type text default null,
  p_source_id uuid default null,
  p_notes text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_reversal_of uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  movement_id uuid;
  current_quantity numeric;
  next_quantity numeric;
begin
  if actor_id is null then
    raise exception 'Authentication is required.' using errcode = '28000';
  end if;
  if p_quantity_delta = 0 then
    raise exception 'Movement quantity cannot be zero.' using errcode = '22023';
  end if;
  if not app_private.subscription_is_active(p_organization_id) then
    raise exception 'The organization subscription is not active.' using errcode = '42501';
  end if;
  if not app_private.has_any_permission(
    p_organization_id,
    array['agricStock','agricUsage','agricRequests','agricLivestock','agricPacking']::public.app_permission[]
  ) then
    raise exception 'You do not have inventory permission.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.inventory_items item
    where item.id = p_item_id and item.organization_id = p_organization_id and item.active
  ) then
    raise exception 'The inventory item does not exist or is inactive.' using errcode = '23503';
  end if;

  if p_idempotency_key is not null then
    select movement.id into movement_id
    from public.inventory_movements movement
    where movement.organization_id = p_organization_id
      and movement.idempotency_key = p_idempotency_key;
    if movement_id is not null then
      return movement_id;
    end if;
  end if;

  insert into public.inventory_balances (item_id, organization_id, quantity)
  values (p_item_id, p_organization_id, 0)
  on conflict (item_id) do nothing;

  select balance.quantity into current_quantity
  from public.inventory_balances balance
  where balance.item_id = p_item_id
    and balance.organization_id = p_organization_id
  for update;

  next_quantity := current_quantity + p_quantity_delta;
  if next_quantity < 0 then
    raise exception 'Insufficient stock. Available: %, requested reduction: %.', current_quantity, abs(p_quantity_delta)
      using errcode = '23514';
  end if;

  insert into public.inventory_movements (
    organization_id, item_id, movement_type, quantity_delta,
    original_quantity, original_unit_id, unit_cost, farm_zone_id,
    source_type, source_id, occurred_at, notes, metadata,
    idempotency_key, reversal_of, created_by
  ) values (
    p_organization_id, p_item_id, p_movement_type, p_quantity_delta,
    p_original_quantity, p_original_unit_id, p_unit_cost, p_farm_zone_id,
    p_source_type, p_source_id, p_occurred_at, p_notes, coalesce(p_metadata, '{}'::jsonb),
    p_idempotency_key, p_reversal_of, actor_id
  ) returning id into movement_id;

  update public.inventory_balances
  set quantity = next_quantity
  where item_id = p_item_id and organization_id = p_organization_id;

  return movement_id;
end;
$$;

revoke all on function public.record_inventory_movement(uuid, uuid, public.inventory_movement_type, numeric, timestamptz, numeric, uuid, numeric, uuid, text, uuid, text, jsonb, text, uuid) from public;
grant execute on function public.record_inventory_movement(uuid, uuid, public.inventory_movement_type, numeric, timestamptz, numeric, uuid, numeric, uuid, text, uuid, text, jsonb, text, uuid) to authenticated;

create or replace function public.approve_stock_adjustment(
  p_adjustment_id uuid,
  p_review_notes text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  adjustment public.stock_adjustments%rowtype;
  current_quantity numeric;
  movement_id uuid;
begin
  select * into adjustment
  from public.stock_adjustments
  where id = p_adjustment_id
  for update;

  if not found then raise exception 'Adjustment not found.' using errcode = 'P0002'; end if;
  if not app_private.can_manage_org(adjustment.organization_id) then
    raise exception 'Only an owner or authorized manager can approve adjustments.' using errcode = '42501';
  end if;
  if adjustment.status <> 'pending_approval' then
    raise exception 'Only pending adjustments can be approved.' using errcode = '23514';
  end if;

  select quantity into current_quantity
  from public.inventory_balances
  where item_id = adjustment.item_id
  for update;

  if current_quantity is distinct from adjustment.expected_quantity then
    raise exception 'The stock balance changed after this adjustment was requested. Review it again.' using errcode = '40001';
  end if;
  if adjustment.requested_quantity = current_quantity then
    raise exception 'The requested quantity already matches the current stock balance.' using errcode = '22023';
  end if;

  movement_id := public.record_inventory_movement(
    adjustment.organization_id,
    adjustment.item_id,
    'adjustment',
    adjustment.requested_quantity - current_quantity,
    now(),
    null, null, null, null,
    'stock_adjustment', adjustment.id,
    adjustment.reason,
    jsonb_build_object('review_notes', p_review_notes),
    coalesce(p_idempotency_key, 'adjustment:' || adjustment.id::text),
    null
  );

  update public.stock_adjustments
  set status = 'approved', reviewed_by = (select auth.uid()), reviewed_at = now(),
      review_notes = p_review_notes, movement_id = movement_id
  where id = adjustment.id;

  return movement_id;
end;
$$;

revoke all on function public.approve_stock_adjustment(uuid, text, text) from public;
grant execute on function public.approve_stock_adjustment(uuid, text, text) to authenticated;

create or replace function public.accept_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.invitations%rowtype;
begin
  if (select auth.uid()) is null or app_private.current_email() is null then
    raise exception 'Authentication with a verified email is required.' using errcode = '28000';
  end if;

  select * into invitation
  from public.invitations
  where id = p_invitation_id
  for update;

  if not found then raise exception 'Invitation not found.' using errcode = 'P0002'; end if;
  if invitation.status <> 'pending' or invitation.expires_at <= now() then
    raise exception 'This invitation is invalid or expired.' using errcode = '23514';
  end if;
  if invitation.email <> app_private.current_email() then
    raise exception 'This invitation belongs to another email address.' using errcode = '42501';
  end if;

  insert into public.organization_memberships (
    organization_id, user_id, role, permissions, invited_by, joined_at
  ) values (
    invitation.organization_id, (select auth.uid()), invitation.role, invitation.permissions,
    invitation.invited_by, now()
  )
  on conflict (organization_id, user_id) do update
    set role = excluded.role,
        permissions = excluded.permissions,
        active = true,
        invited_by = excluded.invited_by,
        joined_at = now(),
        updated_at = now();

  update public.invitations
  set status = 'accepted', accepted_by = (select auth.uid()), accepted_at = now()
  where id = invitation.id;

  update public.profiles
  set default_organization_id = coalesce(default_organization_id, invitation.organization_id),
      updated_at = now()
  where id = (select auth.uid());

  return invitation.organization_id;
end;
$$;

revoke all on function public.accept_invitation(uuid) from public;
grant execute on function public.accept_invitation(uuid) to authenticated;

create or replace view public.inventory_stock
with (security_invoker = true)
as
select
  item.id,
  item.organization_id,
  item.name,
  item.chemical_component,
  item.category,
  unit.code as stock_unit,
  unit.name as stock_unit_name,
  coalesce(balance.quantity, 0) as current_stock,
  item.minimum_stock,
  case
    when coalesce(balance.quantity, 0) <= 0 then 'out_of_stock'
    when coalesce(balance.quantity, 0) <= item.minimum_stock * 0.5 then 'critical'
    when coalesce(balance.quantity, 0) <= item.minimum_stock then 'low_stock'
    else 'in_stock'
  end as stock_status,
  item.unit_cost,
  item.storage_location,
  item.active,
  item.updated_at,
  item.revision
from public.inventory_items item
join public.units_of_measure unit on unit.id = item.stock_unit_id
left join public.inventory_balances balance on balance.item_id = item.id;

create or replace view public.packing_available_stock
with (security_invoker = true)
as
select
  record.id as packing_record_id,
  record.organization_id,
  record.station_id,
  record.produce,
  record.lot_number,
  record.quality_grade,
  record.market,
  record.destination_country,
  record.accepted_packages,
  coalesce(sum(allocation.packages), 0) as shipped_packages,
  record.accepted_packages - coalesce(sum(allocation.packages), 0) as available_packages,
  record.packed_on
from public.packing_records record
left join public.shipment_allocations allocation on allocation.packing_record_id = record.id
where record.archived_at is null
group by record.id;

create or replace view public.sales_balances
with (security_invoker = true)
as
select
  sale.id,
  sale.organization_id,
  sale.sale_number,
  sale.sold_at,
  sale.currency,
  sale.total_amount,
  coalesce(sum(payment.amount), 0) as amount_paid,
  sale.total_amount - coalesce(sum(payment.amount), 0) as balance_due
from public.sales sale
left join public.sale_payments payment on payment.sale_id = sale.id
where sale.archived_at is null
group by sale.id;

create or replace view public.expense_budget_status
with (security_invoker = true)
as
select
  budget.id,
  budget.organization_id,
  budget.name,
  budget.amount,
  budget.currency,
  budget.start_date,
  budget.end_date,
  coalesce(sum(expense.amount) filter (where expense.status in ('approved', 'paid')), 0) as spent,
  budget.amount - coalesce(sum(expense.amount) filter (where expense.status in ('approved', 'paid')), 0) as remaining
from public.expense_budgets budget
left join public.expenses expense
  on expense.budget_id = budget.id
 and expense.expense_date between budget.start_date and budget.end_date
 and expense.archived_at is null
where budget.active
group by budget.id;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke insert, update, delete on public.inventory_balances from authenticated;
revoke insert, update, delete on public.inventory_movements from authenticated;
revoke insert, update, delete on public.stock_issues from authenticated;
revoke insert, update, delete on public.stock_issue_returns from authenticated;
revoke insert, update, delete on public.stock_request_events from authenticated;
revoke insert, update, delete on public.packing_quality_events from authenticated;
revoke insert, update, delete on public.shipment_allocations from authenticated;
revoke insert, update, delete on public.sale_payments from authenticated;
revoke insert, update, delete on public.sales_receipts from authenticated;
revoke insert, update, delete on public.deletion_audit from authenticated;
revoke insert, update, delete on public.audit_events from authenticated;
revoke insert, update, delete on public.organization_subscriptions from authenticated;
revoke insert, update, delete on public.usage_events from authenticated;
revoke insert, update, delete on public.usage_period_counters from authenticated;

do $$
declare
  table_name text;
begin
  for table_name in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end;
$$;

create policy platform_admins_select on public.platform_admins
  for select to authenticated
  using (app_private.is_platform_admin());
create policy platform_admins_manage on public.platform_admins
  for all to authenticated
  using (app_private.is_platform_admin())
  with check (app_private.is_platform_admin());

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or app_private.is_platform_admin()
    or exists (
      select 1 from public.organization_memberships target
      where target.user_id = profiles.id
        and app_private.can_manage_org(target.organization_id)
    )
  );
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or app_private.is_platform_admin())
  with check (id = (select auth.uid()) or app_private.is_platform_admin());

create policy organizations_select on public.organizations
  for select to authenticated
  using (app_private.is_org_member(id));
create policy organizations_insert on public.organizations
  for insert to authenticated
  with check (owner_id = (select auth.uid()) or app_private.is_platform_admin());
create policy organizations_update on public.organizations
  for update to authenticated
  using (app_private.has_any_permission(id, array['settings']::public.app_permission[]))
  with check (app_private.has_any_permission(id, array['settings']::public.app_permission[]));
create policy organizations_delete on public.organizations
  for delete to authenticated
  using (app_private.is_platform_admin());

create policy memberships_select on public.organization_memberships
  for select to authenticated
  using (user_id = (select auth.uid()) or app_private.can_manage_org(organization_id));
create policy invitations_select on public.invitations
  for select to authenticated
  using (email = app_private.current_email() or app_private.can_manage_org(organization_id));
create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (
    invited_by = (select auth.uid())
    and app_private.can_manage_org(organization_id)
    and app_private.subscription_is_active(organization_id)
  );
create policy invitations_manage on public.invitations
  for update to authenticated
  using (app_private.can_manage_org(organization_id))
  with check (app_private.can_manage_org(organization_id));

create policy role_templates_select on public.role_templates
  for select to authenticated
  using (organization_id is null or app_private.is_org_member(organization_id));
create policy role_templates_manage on public.role_templates
  for all to authenticated
  using (organization_id is not null and app_private.can_manage_org(organization_id))
  with check (organization_id is not null and app_private.can_manage_org(organization_id));

create policy plans_select on public.plans for select to authenticated using (true);
create policy plan_entitlements_select on public.plan_entitlements for select to authenticated using (true);
create policy plan_prices_select on public.plan_prices for select to authenticated using (active or app_private.is_platform_admin());
create policy plans_manage on public.plans for all to authenticated using (app_private.is_platform_admin()) with check (app_private.is_platform_admin());
create policy plan_entitlements_manage on public.plan_entitlements for all to authenticated using (app_private.is_platform_admin()) with check (app_private.is_platform_admin());
create policy plan_prices_manage on public.plan_prices for all to authenticated using (app_private.is_platform_admin()) with check (app_private.is_platform_admin());

create policy subscriptions_select on public.organization_subscriptions
  for select to authenticated using (app_private.is_org_member(organization_id));
create policy usage_events_select on public.usage_events
  for select to authenticated using (app_private.is_platform_admin() or app_private.has_any_permission(organization_id, array['billing']::public.app_permission[]));
create policy usage_counters_select on public.usage_period_counters
  for select to authenticated using (app_private.is_platform_admin() or app_private.has_any_permission(organization_id, array['billing']::public.app_permission[]));

create policy farm_profiles_select on public.farm_profiles for select to authenticated using (app_private.is_org_member(organization_id));
create policy farm_profiles_manage on public.farm_profiles for all to authenticated
  using (app_private.subscription_is_active(organization_id) and app_private.has_any_permission(organization_id, array['settings']::public.app_permission[]))
  with check (app_private.subscription_is_active(organization_id) and app_private.has_any_permission(organization_id, array['settings']::public.app_permission[]));
create policy farm_locations_select on public.farm_locations for select to authenticated using (app_private.is_org_member(organization_id));
create policy farm_locations_manage on public.farm_locations for all to authenticated
  using (app_private.subscription_is_active(organization_id) and app_private.has_any_permission(organization_id, array['settings','agricWeather']::public.app_permission[]))
  with check (app_private.subscription_is_active(organization_id) and app_private.has_any_permission(organization_id, array['settings','agricWeather']::public.app_permission[]));
create policy farm_zones_select on public.farm_zones for select to authenticated using (app_private.is_org_member(organization_id));
create policy farm_zones_manage on public.farm_zones for all to authenticated
  using (app_private.subscription_is_active(organization_id) and app_private.has_any_permission(organization_id, array['settings','agricCrops']::public.app_permission[]))
  with check (app_private.subscription_is_active(organization_id) and app_private.has_any_permission(organization_id, array['settings','agricCrops']::public.app_permission[]));

create policy units_select on public.units_of_measure
  for select to authenticated using (organization_id is null or app_private.is_org_member(organization_id));
create policy units_manage on public.units_of_measure
  for all to authenticated
  using (organization_id is not null and app_private.has_any_permission(organization_id, array['settings','agricStock']::public.app_permission[]))
  with check (organization_id is not null and app_private.has_any_permission(organization_id, array['settings','agricStock']::public.app_permission[]));

create policy inventory_items_select on public.inventory_items for select to authenticated
  using (app_private.has_any_permission(organization_id, array['agricStock','agricReports','agricRequests','agricUsage','agricPlanner','agricLivestock']::public.app_permission[]));
create policy inventory_items_manage on public.inventory_items for all to authenticated
  using (app_private.subscription_is_active(organization_id) and app_private.has_any_permission(organization_id, array['agricStock']::public.app_permission[]))
  with check (app_private.subscription_is_active(organization_id) and app_private.has_any_permission(organization_id, array['agricStock']::public.app_permission[]));
create policy inventory_item_units_select on public.inventory_item_units for select to authenticated
  using (app_private.has_any_permission(organization_id, array['agricStock','agricRequests','agricUsage','agricPlanner','agricLivestock']::public.app_permission[]));
create policy inventory_item_units_manage on public.inventory_item_units for all to authenticated
  using (app_private.subscription_is_active(organization_id) and app_private.has_any_permission(organization_id, array['agricStock']::public.app_permission[]))
  with check (app_private.subscription_is_active(organization_id) and app_private.has_any_permission(organization_id, array['agricStock']::public.app_permission[]));
create policy inventory_balances_select on public.inventory_balances for select to authenticated
  using (app_private.has_any_permission(organization_id, array['agricStock','agricReports','agricRequests','agricUsage','agricPlanner','agricLivestock']::public.app_permission[]));
create policy inventory_movements_select on public.inventory_movements for select to authenticated
  using (app_private.has_any_permission(organization_id, array['agricStock','agricReports','agricUsage']::public.app_permission[]));
create policy stock_adjustments_select on public.stock_adjustments for select to authenticated
  using (app_private.has_any_permission(organization_id, array['agricStock','agricReports']::public.app_permission[]));
create policy stock_adjustments_insert on public.stock_adjustments for insert to authenticated
  with check (requested_by = (select auth.uid()) and app_private.subscription_is_active(organization_id) and app_private.has_any_permission(organization_id, array['agricStock']::public.app_permission[]));

create policy stock_requests_select on public.stock_requests for select to authenticated
  using (app_private.has_any_permission(organization_id, array['agricRequests']::public.app_permission[]) and (status <> 'draft' or requested_by = (select auth.uid()) or app_private.can_manage_org(organization_id)));
create policy stock_requests_insert on public.stock_requests for insert to authenticated
  with check (requested_by = (select auth.uid()) and app_private.subscription_is_active(organization_id) and app_private.has_any_permission(organization_id, array['agricRequests']::public.app_permission[]));
create policy stock_request_items_select on public.stock_request_items for select to authenticated
  using (app_private.has_any_permission(organization_id, array['agricRequests']::public.app_permission[]));
create policy stock_request_items_insert on public.stock_request_items for insert to authenticated
  with check (
    app_private.subscription_is_active(organization_id)
    and app_private.has_any_permission(organization_id, array['agricRequests']::public.app_permission[])
    and exists (
      select 1 from public.stock_requests request
      where request.id = stock_request_items.request_id
        and request.organization_id = stock_request_items.organization_id
        and request.requested_by = (select auth.uid())
        and request.status in ('draft', 'pending')
    )
  );
create policy stock_issues_select on public.stock_issues for select to authenticated
  using (app_private.has_any_permission(organization_id, array['agricRequests','agricStock','agricUsage']::public.app_permission[]));
create policy stock_issue_returns_select on public.stock_issue_returns for select to authenticated
  using (app_private.has_any_permission(organization_id, array['agricRequests','agricStock']::public.app_permission[]));
create policy stock_request_events_select on public.stock_request_events for select to authenticated
  using (app_private.has_any_permission(organization_id, array['agricRequests','agricReports']::public.app_permission[]));

create policy usage_logs_select on public.usage_logs for select to authenticated
  using (app_private.has_any_permission(organization_id, array['agricUsage','agricReports']::public.app_permission[]));
create policy usage_logs_insert on public.usage_logs for insert to authenticated
  with check (recorded_by = (select auth.uid()) and app_private.subscription_is_active(organization_id) and app_private.has_any_permission(organization_id, array['agricUsage']::public.app_permission[]));
create policy usage_logs_update on public.usage_logs for update to authenticated
  using (app_private.can_manage_org(organization_id))
  with check (app_private.can_manage_org(organization_id));

do $$
declare
  table_name text;
  permission_name text;
begin
  for table_name, permission_name in
    select * from (values
      ('equipment_assets', 'agricEquipment'), ('equipment_checkouts', 'agricEquipment'),
      ('spray_plans', 'agricPlanner'), ('spray_plan_items', 'agricPlanner'), ('spray_applications', 'agricPlanner'),
      ('packing_stations', 'agricPacking'), ('packing_station_members', 'agricPacking'),
      ('packing_crew_profiles', 'agricPacking'), ('packing_crew_members', 'agricPacking'),
      ('transport_profiles', 'agricPacking'), ('customers', 'agricPacking'),
      ('packing_fulfilment_plans', 'agricPacking'), ('packing_records', 'agricPacking'),
      ('shipments', 'agricPacking'), ('sales', 'agricPacking'), ('sale_items', 'agricPacking'),
      ('document_sequences', 'agricPacking'),
      ('expense_categories', 'expenses'), ('expense_budgets', 'expenses'), ('expenses', 'expenses'),
      ('crop_plans', 'agricCrops'),
      ('livestock_pens', 'agricLivestock'), ('livestock_groups', 'agricLivestock'), ('livestock_events', 'agricLivestock'),
      ('water_records', 'agricWeather'),
      ('sigatoka_settings', 'agricSigatoka'), ('sigatoka_plots', 'agricSigatoka'),
      ('sigatoka_sentinel_plants', 'agricSigatoka'), ('sigatoka_observations', 'agricSigatoka'),
      ('sigatoka_plant_observations', 'agricSigatoka'), ('sigatoka_leaf_scores', 'agricSigatoka'),
      ('sigatoka_advanced_stage_counts', 'agricSigatoka')
    ) as permission_map(table_name, permission_name)
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (app_private.has_any_permission(organization_id, array[%L::public.app_permission, ''agricReports''::public.app_permission]))',
      table_name || '_select', table_name, permission_name
    );
    execute format(
      'create policy %I on public.%I for all to authenticated using (app_private.subscription_is_active(organization_id) and app_private.has_any_permission(organization_id, array[%L::public.app_permission])) with check (app_private.subscription_is_active(organization_id) and app_private.has_any_permission(organization_id, array[%L::public.app_permission]))',
      table_name || '_manage', table_name, permission_name, permission_name
    );
  end loop;
end;
$$;

create policy packing_quality_standards_select on public.packing_quality_standards
  for select to authenticated using (organization_id is null or app_private.has_any_permission(organization_id, array['agricPacking','agricReports']::public.app_permission[]));
create policy packing_quality_standards_manage on public.packing_quality_standards
  for all to authenticated using (organization_id is not null and app_private.can_manage_org(organization_id))
  with check (organization_id is not null and app_private.can_manage_org(organization_id));
create policy packing_quality_grades_select on public.packing_quality_grades
  for select to authenticated using (exists (
    select 1 from public.packing_quality_standards standard
    where standard.id = standard_id
      and (standard.organization_id is null or app_private.has_any_permission(standard.organization_id, array['agricPacking','agricReports']::public.app_permission[]))
  ));
create policy packing_quality_events_select on public.packing_quality_events
  for select to authenticated using (app_private.has_any_permission(organization_id, array['agricPacking','agricReports']::public.app_permission[]));
create policy shipment_allocations_select on public.shipment_allocations
  for select to authenticated using (app_private.has_any_permission(organization_id, array['agricPacking','agricReports']::public.app_permission[]));
create policy sale_payments_select on public.sale_payments
  for select to authenticated using (app_private.has_any_permission(organization_id, array['agricPacking','agricReports']::public.app_permission[]));
create policy sales_receipts_select on public.sales_receipts
  for select to authenticated using (app_private.has_any_permission(organization_id, array['agricPacking','agricReports']::public.app_permission[]));

create policy alerts_select on public.alerts
  for select to authenticated using (app_private.is_org_member(organization_id));
create policy alerts_update on public.alerts
  for update to authenticated using (app_private.is_org_member(organization_id))
  with check (app_private.is_org_member(organization_id));
create policy deletion_audit_select on public.deletion_audit
  for select to authenticated using (app_private.can_manage_org(organization_id));
create policy audit_events_select on public.audit_events
  for select to authenticated using (organization_id is not null and app_private.can_manage_org(organization_id));

create policy platform_settings_select on public.platform_settings
  for select to authenticated using (app_private.is_platform_admin());
create policy platform_settings_manage on public.platform_settings
  for all to authenticated using (app_private.is_platform_admin()) with check (app_private.is_platform_admin());

grant usage on schema app_private to authenticated;
revoke all on all functions in schema app_private from public;
grant execute on function app_private.current_email() to authenticated;
grant execute on function app_private.is_platform_admin() to authenticated;
grant execute on function app_private.is_org_member(uuid) to authenticated;
grant execute on function app_private.membership_role(uuid) to authenticated;
grant execute on function app_private.has_any_permission(uuid, public.app_permission[]) to authenticated;
grant execute on function app_private.can_manage_org(uuid) to authenticated;
grant execute on function app_private.subscription_is_active(uuid) to authenticated;
grant execute on function app_private.entitlement_limit(uuid, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('tenant-assets', 'tenant-assets', false, 5242880, array['image/png','image/jpeg','image/webp','image/svg+xml']),
  ('expense-receipts', 'expense-receipts', false, 10485760, array['image/png','image/jpeg','image/webp','application/pdf']),
  ('sales-receipts', 'sales-receipts', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function app_private.storage_organization_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  first_segment text;
begin
  first_segment := split_part(object_name, '/', 1);
  if first_segment ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return first_segment::uuid;
  end if;
  return null;
end;
$$;

grant execute on function app_private.storage_organization_id(text) to authenticated;

create policy tenant_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id in ('tenant-assets', 'expense-receipts', 'sales-receipts')
    and app_private.is_org_member(app_private.storage_organization_id(name))
  );
create policy tenant_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('tenant-assets', 'expense-receipts', 'sales-receipts')
    and app_private.subscription_is_active(app_private.storage_organization_id(name))
    and (
      (bucket_id = 'tenant-assets' and app_private.has_any_permission(app_private.storage_organization_id(name), array['settings']::public.app_permission[]))
      or (bucket_id = 'expense-receipts' and app_private.has_any_permission(app_private.storage_organization_id(name), array['expenses']::public.app_permission[]))
      or (bucket_id = 'sales-receipts' and app_private.has_any_permission(app_private.storage_organization_id(name), array['agricPacking']::public.app_permission[]))
    )
  );
create policy tenant_storage_update on storage.objects
  for update to authenticated
  using (app_private.can_manage_org(app_private.storage_organization_id(name)))
  with check (app_private.can_manage_org(app_private.storage_organization_id(name)));
create policy tenant_storage_delete on storage.objects
  for delete to authenticated
  using (app_private.can_manage_org(app_private.storage_organization_id(name)));

commit;
