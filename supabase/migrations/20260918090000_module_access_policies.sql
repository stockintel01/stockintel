begin;

-- Row-level security is enabled and forced on every public table, but these ones
-- carry no policy, which denies clients all access to them. That is invisible while
-- Firebase serves the data and becomes an empty equipment list, packhouse, expense
-- ledger, livestock record and scouting sheet the moment NEXT_PUBLIC_DATA_BACKEND
-- switches to supabase.
--
-- The mapping below follows the conventions already in use: a read needs any
-- permission that legitimately displays the record, a write needs the module's own
-- permission and an active subscription. Owners and platform administrators pass
-- through app_private.has_any_permission.
--
-- public.document_sequences is deliberately left with no policy. Only
-- app_private.next_document_number touches it, and it runs as a definer.

do $$
declare
  module record;
begin
  for module in
    select *
    from (values
      ('equipment_assets',             array['agricEquipment', 'agricReports'],                array['agricEquipment']),
      ('equipment_checkouts',          array['agricEquipment', 'agricReports'],                array['agricEquipment']),
      ('spray_plans',                  array['agricPlanner', 'agricStock', 'agricReports'],    array['agricPlanner']),
      ('spray_plan_items',             array['agricPlanner', 'agricStock', 'agricReports'],    array['agricPlanner']),
      ('spray_applications',           array['agricPlanner', 'agricUsage', 'agricReports'],    array['agricPlanner']),
      ('packing_stations',             array['agricPacking', 'agricReports'],                  array['agricPacking']),
      ('packing_station_members',      array['agricPacking', 'agricReports'],                  array['agricPacking']),
      ('packing_crew_profiles',        array['agricPacking', 'agricReports'],                  array['agricPacking']),
      ('packing_crew_members',         array['agricPacking', 'agricReports'],                  array['agricPacking']),
      ('packing_fulfilment_plans',     array['agricPacking', 'agricReports'],                  array['agricPacking']),
      ('packing_records',              array['agricPacking', 'agricReports'],                  array['agricPacking']),
      ('transport_profiles',           array['agricPacking', 'agricReports'],                  array['agricPacking']),
      ('customers',                    array['agricPacking', 'agricReports', 'settings'],      array['agricPacking']),
      ('sales',                        array['agricPacking', 'agricReports', 'expenses'],      array['agricPacking']),
      ('sale_items',                   array['agricPacking', 'agricReports', 'expenses'],      array['agricPacking']),
      ('expense_categories',           array['expenses', 'agricReports'],                      array['expenses']),
      ('expense_budgets',              array['expenses', 'agricReports'],                      array['expenses']),
      ('expenses',                     array['expenses', 'agricReports'],                      array['expenses']),
      ('crop_plans',                   array['agricCrops', 'agricPlanner', 'agricReports'],    array['agricCrops']),
      ('livestock_pens',               array['agricLivestock', 'agricReports'],                array['agricLivestock']),
      ('livestock_groups',             array['agricLivestock', 'agricReports'],                array['agricLivestock']),
      ('livestock_events',             array['agricLivestock', 'agricReports'],                array['agricLivestock']),
      ('water_records',                array['agricWeather', 'agricPlanner', 'agricReports'],  array['agricWeather']),
      ('sigatoka_settings',            array['agricSigatoka', 'agricReports'],                 array['agricSigatoka']),
      ('sigatoka_plots',               array['agricSigatoka', 'agricReports'],                 array['agricSigatoka']),
      ('sigatoka_sentinel_plants',     array['agricSigatoka', 'agricReports'],                 array['agricSigatoka']),
      ('sigatoka_observations',        array['agricSigatoka', 'agricReports'],                 array['agricSigatoka']),
      ('sigatoka_plant_observations',  array['agricSigatoka', 'agricReports'],                 array['agricSigatoka']),
      ('sigatoka_leaf_scores',         array['agricSigatoka', 'agricReports'],                 array['agricSigatoka']),
      ('sigatoka_advanced_stage_counts', array['agricSigatoka', 'agricReports'],               array['agricSigatoka'])
    ) as mapping(table_name, read_permissions, write_permissions)
  loop
    -- Separate commands rather than FOR ALL, so a read never evaluates the write rule.
    execute format(
      'create policy %I on public.%I for select to authenticated '
      || 'using (app_private.has_any_permission(organization_id, %L::public.app_permission[]))',
      module.table_name || '_select', module.table_name, module.read_permissions
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated '
      || 'with check (app_private.subscription_is_active(organization_id) '
      || 'and app_private.has_any_permission(organization_id, %L::public.app_permission[]))',
      module.table_name || '_insert', module.table_name, module.write_permissions
    );
    execute format(
      'create policy %I on public.%I for update to authenticated '
      || 'using (app_private.subscription_is_active(organization_id) '
      || 'and app_private.has_any_permission(organization_id, %L::public.app_permission[])) '
      || 'with check (app_private.subscription_is_active(organization_id) '
      || 'and app_private.has_any_permission(organization_id, %L::public.app_permission[]))',
      module.table_name || '_update', module.table_name, module.write_permissions, module.write_permissions
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated '
      || 'using (app_private.subscription_is_active(organization_id) '
      || 'and app_private.has_any_permission(organization_id, %L::public.app_permission[]))',
      module.table_name || '_delete', module.table_name, module.write_permissions
    );
  end loop;
end;
$$;

-- Read-only for clients because public.create_shipment writes the shipment, its
-- allocations and the stock movements together. A direct insert here would create a
-- shipment that moved no stock, which is why shipment_allocations is read-only too.
do $$
declare
  module record;
begin
  for module in
    select *
    from (values
      ('shipments', array['agricPacking', 'agricReports'])
    ) as mapping(table_name, read_permissions)
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated '
      || 'using (app_private.has_any_permission(organization_id, %L::public.app_permission[]))',
      module.table_name || '_select', module.table_name, module.read_permissions
    );
  end loop;
end;
$$;

-- Fails the migration if any public table is still readable by nobody, so a table
-- added later cannot quietly become invisible to the whole application.
do $$
declare
  unreachable text[];
begin
  select coalesce(array_agg(candidate.tablename order by candidate.tablename), array[]::text[])
  into unreachable
  from pg_tables candidate
  where candidate.schemaname = 'public'
    and candidate.tablename not in ('document_sequences', 'contact_link_codes', 'notification_alert_states', 'inbound_message_receipts')
    and not exists (
      select 1
      from pg_policy policy_record
      join pg_class table_record on table_record.oid = policy_record.polrelid
      join pg_namespace namespace_record on namespace_record.oid = table_record.relnamespace
      where namespace_record.nspname = 'public'
        and table_record.relname = candidate.tablename
        and policy_record.polcmd in ('r', '*')
    );

  if array_length(unreachable, 1) > 0 then
    raise exception 'These tables have row-level security with no read policy: %', array_to_string(unreachable, ', ');
  end if;
end;
$$;

commit;
