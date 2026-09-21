begin;

-- Supabase grants API roles execute access to new public functions by default.
-- These three predate the explicit grants in the hardening migration.
revoke all on function public.accept_invitation(uuid) from anon;
revoke all on function public.approve_stock_adjustment(uuid, text, text) from anon;
revoke all on function public.record_inventory_movement(
  uuid, uuid, public.inventory_movement_type, numeric, timestamptz,
  numeric, uuid, numeric, uuid, text, uuid, text, jsonb, text, uuid
) from anon;

-- This platform helper is installed automatically and must never be an API RPC.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

-- Keep future functions private until a migration explicitly grants a caller.
alter default privileges in schema public revoke execute on functions from public;

-- Keep local and hosted Data API privileges identical when automatic table
-- exposure is disabled. Row-level security remains the authorization boundary.
revoke all on all tables in schema public from public, anon;
revoke all on all sequences in schema public from public, anon;

-- Add one covering index for each FK key that does not already have one.
-- Composite keys are handled first so they also satisfy matching single-column FKs.
do $$
declare
  foreign_key record;
  column_list text;
  index_name text;
begin
  for foreign_key in
    select
      constraint_record.conname,
      constraint_record.conrelid,
      constraint_record.conkey,
      namespace_record.nspname as schema_name,
      table_record.relname as table_name
    from pg_constraint constraint_record
    join pg_class table_record on table_record.oid = constraint_record.conrelid
    join pg_namespace namespace_record on namespace_record.oid = table_record.relnamespace
    where constraint_record.contype = 'f'
      and namespace_record.nspname = 'public'
    order by cardinality(constraint_record.conkey) desc, table_record.relname, constraint_record.conname
  loop
    if not exists (
      select 1
      from pg_index index_record
      where index_record.indrelid = foreign_key.conrelid
        and index_record.indisvalid
        and index_record.indpred is null
        and index_record.indexprs is null
        and array(
          select indexed_column
          from unnest(index_record.indkey::smallint[]) with ordinality indexed(indexed_column, position)
          where position <= cardinality(foreign_key.conkey)
          order by position
        ) = foreign_key.conkey
    ) then
      select string_agg(format('%I', attribute_record.attname), ', ' order by key_column.position)
      into column_list
      from unnest(foreign_key.conkey) with ordinality key_column(attribute_number, position)
      join pg_attribute attribute_record
        on attribute_record.attrelid = foreign_key.conrelid
       and attribute_record.attnum = key_column.attribute_number;

      index_name := left(foreign_key.table_name, 38)
        || '_fk_' || substr(md5(foreign_key.conname), 1, 12);
      execute format(
        'create index if not exists %I on %I.%I (%s)',
        index_name,
        foreign_key.schema_name,
        foreign_key.table_name,
        column_list
      );
    end if;
  end loop;
end;
$$;

-- FOR ALL policies also act as SELECT policies. Splitting write operations avoids
-- evaluating both the read and write policy on every query while preserving rules.
do $$
declare
  policy_record record;
  using_expression text;
  check_expression text;
begin
  for policy_record in
    select
      policy_definition.polname as policy_name,
      namespace_record.nspname as schema_name,
      table_record.relname as table_name,
      pg_get_expr(policy_definition.polqual, policy_definition.polrelid) as using_expression,
      pg_get_expr(policy_definition.polwithcheck, policy_definition.polrelid) as check_expression
    from pg_policy policy_definition
    join pg_class table_record on table_record.oid = policy_definition.polrelid
    join pg_namespace namespace_record on namespace_record.oid = table_record.relnamespace
    where namespace_record.nspname = 'public'
      and policy_definition.polcmd = '*'
      and policy_definition.polroles = array[(select oid from pg_roles where rolname = 'authenticated')]
    order by table_record.relname, policy_definition.polname
  loop
    using_expression := coalesce(policy_record.using_expression, 'true');
    check_expression := coalesce(policy_record.check_expression, using_expression, 'true');

    execute format(
      'drop policy %I on %I.%I',
      policy_record.policy_name,
      policy_record.schema_name,
      policy_record.table_name
    );
    execute format(
      'create policy %I on %I.%I for insert to authenticated with check (%s)',
      policy_record.policy_name || '_insert',
      policy_record.schema_name,
      policy_record.table_name,
      check_expression
    );
    execute format(
      'create policy %I on %I.%I for update to authenticated using (%s) with check (%s)',
      policy_record.policy_name || '_update',
      policy_record.schema_name,
      policy_record.table_name,
      using_expression,
      check_expression
    );
    execute format(
      'create policy %I on %I.%I for delete to authenticated using (%s)',
      policy_record.policy_name || '_delete',
      policy_record.schema_name,
      policy_record.table_name,
      using_expression
    );
  end loop;
end;
$$;

commit;
