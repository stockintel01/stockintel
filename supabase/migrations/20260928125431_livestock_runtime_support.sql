begin;

create or replace function public.record_livestock_event(
  p_organization_id uuid,
  p_group_id uuid,
  p_event_kind text,
  p_event_date date,
  p_payload jsonb,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_feed_item_id uuid;
  v_kg_unit_id uuid;
  v_feed_quantity numeric;
  v_stock_quantity numeric;
  v_count integer;
  v_group public.livestock_groups%rowtype;
  v_movement_id uuid;
begin
  if not app_private.subscription_is_active(p_organization_id)
    or not app_private.has_any_permission(p_organization_id, array['agricLivestock']::public.app_permission[]) then
    raise exception 'You do not have permission to record livestock activity.' using errcode = '42501';
  end if;
  if p_event_kind not in ('egg_production', 'egg_sale', 'feed_log', 'feed_plan', 'mortality', 'vaccination', 'weight', 'milk', 'livestock_sale', 'population_adjustment')
    or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Livestock event type or payload is invalid.' using errcode = '22023';
  end if;
  if p_idempotency_key is not null then
    select event.id into v_event_id from public.livestock_events event
    where event.organization_id = p_organization_id and event.idempotency_key = p_idempotency_key;
    if v_event_id is not null then return v_event_id; end if;
  end if;
  if p_group_id is not null then
    select * into v_group from public.livestock_groups
    where id = p_group_id and organization_id = p_organization_id for update;
    if not found then raise exception 'Livestock group not found.' using errcode = 'P0002'; end if;
  end if;
  v_event_id := gen_random_uuid();
  if p_event_kind = 'feed_log' then
    v_feed_item_id := nullif(p_payload ->> 'feedItemId', '')::uuid;
    v_feed_quantity := nullif(p_payload ->> 'quantityKg', '')::numeric;
    select unit.id into v_kg_unit_id from public.units_of_measure unit
    where unit.organization_id is null and lower(unit.code::text) = 'kg' limit 1;
    v_stock_quantity := app_private.to_stock_quantity(p_organization_id, v_feed_item_id, v_kg_unit_id, v_feed_quantity);
    v_movement_id := public.record_inventory_movement(
      p_organization_id, v_feed_item_id, 'usage', -v_stock_quantity,
      p_event_date::timestamptz, v_feed_quantity, v_kg_unit_id,
      null, null, 'livestock_feed', v_event_id, p_payload ->> 'notes',
      jsonb_build_object('group_id', p_group_id, 'event_kind', p_event_kind),
      case when p_idempotency_key is null then null else 'feed-movement:' || p_idempotency_key end,
      null
    );
  end if;
  if p_event_kind in ('mortality', 'livestock_sale') then
    if p_group_id is null then raise exception 'A livestock group is required.' using errcode = '22023'; end if;
    v_count := nullif(p_payload ->> 'count', '')::integer;
    if v_count is null or v_count <= 0 or v_count > v_group.current_count then
      raise exception 'The livestock count is invalid or exceeds the current population.' using errcode = '23514';
    end if;
    update public.livestock_groups set current_count = current_count - v_count where id = p_group_id;
  end if;
  insert into public.livestock_events (
    id, organization_id, group_id, event_kind, event_date, payload,
    inventory_movement_id, recorded_by, idempotency_key
  ) values (
    v_event_id, p_organization_id, p_group_id, p_event_kind, p_event_date,
    p_payload, v_movement_id, (select auth.uid()), p_idempotency_key
  );
  return v_event_id;
end;
$$;

revoke all on function public.record_livestock_event(uuid, uuid, text, date, jsonb, text) from public, anon;
grant execute on function public.record_livestock_event(uuid, uuid, text, date, jsonb, text) to authenticated;

commit;
