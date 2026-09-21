begin;

-- The application keeps live subscriptions open on every workspace screen through
-- Firestore snapshot listeners. Realtime only broadcasts tables in the
-- supabase_realtime publication, so without these the equivalent Supabase screens
-- would load once and then never update.
--
-- Each table listed here backs a subscription in lib/agric/agric-service.ts,
-- lib/agric/useLivestock.ts or lib/expenses/useExpenses.ts. Realtime applies the same
-- row-level security policies as a normal read, so a subscriber only receives rows it
-- is already allowed to see.

do $$
declare
  publication_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication is absent; skipping realtime registration.';
    return;
  end if;

  foreach publication_table in array array[
    -- Stock management and requests
    'inventory_items', 'inventory_balances', 'stock_adjustments',
    'stock_requests', 'stock_request_items', 'stock_issues',
    -- Field work
    'usage_logs', 'spray_plans', 'spray_plan_items',
    'equipment_assets', 'equipment_checkouts',
    -- Packhouse and dispatch
    'packing_records', 'packing_quality_standards', 'packing_quality_grades', 'shipments',
    -- Money
    'expense_categories', 'expense_budgets', 'expenses',
    -- Agronomy and livestock
    'water_records', 'sigatoka_observations', 'livestock_groups', 'livestock_events',
    -- Notices
    'alerts', 'deletion_audit'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = publication_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', publication_table);
    end if;
  end loop;
end;
$$;

-- Realtime sends only the primary key of a deleted or updated row unless the table
-- replicates its full old row. The screens that reconcile a list after a delete need
-- that, and these tables are small enough for the extra write-ahead log volume.
do $$
declare
  full_identity_table text;
begin
  foreach full_identity_table in array array[
    'inventory_items', 'stock_requests', 'expense_categories', 'expense_budgets',
    'expenses', 'equipment_checkouts', 'spray_plans', 'alerts'
  ] loop
    execute format('alter table public.%I replica identity full', full_identity_table);
  end loop;
end;
$$;

commit;
