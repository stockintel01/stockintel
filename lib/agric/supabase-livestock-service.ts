'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { getBrowserSupabaseClient } from '@/lib/supabase/browser';
import type { LivestockRecordKind, LivestockState } from './useLivestock';
import type { AnimalFlockHerd, PenHouse } from './livestock-types';

type Row = Record<string, any>;
const db = () => getBrowserSupabaseClient() as unknown as SupabaseClient;
const check = (error: { message?: string } | null, action: string) => { if (error) throw new Error(`${action}: ${error.message ?? 'operation failed'}`); };
const EVENT_KIND: Partial<Record<LivestockRecordKind, string>> = {
  eggProduction: 'egg_production', eggSale: 'egg_sale', feedLog: 'feed_log', feedPlan: 'feed_plan',
  mortality: 'mortality', vaccination: 'vaccination', weight: 'weight', milk: 'milk', livestockSale: 'livestock_sale',
};
type LivestockRecordStateKey = keyof Omit<LivestockState, 'loading' | 'error'>;
const STATE_KEY: Record<string, LivestockRecordStateKey> = {
  egg_production: 'eggRecords', egg_sale: 'eggSales', feed_log: 'feedLogs', feed_plan: 'feedPlans',
  mortality: 'mortality', vaccination: 'vaccinations', weight: 'weights', milk: 'milkRecords', livestock_sale: 'livestockSales',
};

async function rows(table: string, organizationId: string) {
  const result: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from(table).select('*').eq('organization_id', organizationId).range(from, from + 999);
    check(error, `Unable to load ${table}`);
    result.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) return result;
  }
}

async function load(organizationId: string): Promise<Omit<LivestockState, 'loading' | 'error'>> {
  const [pens, groups, events, zones] = await Promise.all([
    rows('livestock_pens', organizationId), rows('livestock_groups', organizationId),
    rows('livestock_events', organizationId), rows('farm_zones', organizationId),
  ]);
  const zoneById = new Map(zones.map(row => [String(row.id), row]));
  const groupById = new Map(groups.map(row => [String(row.id), row]));
  const penById = new Map(pens.map(row => [String(row.id), row]));
  const result: Omit<LivestockState, 'loading' | 'error'> = {
    flocks: groups.map(row => {
      const details = row.details as Row;
      const pen = penById.get(String(row.pen_id));
      return {
        id: String(row.id), name: row.name, species: row.species, breed: row.breed ?? undefined, purpose: row.purpose,
        penHouseId: row.pen_id ?? '', penHouseName: pen?.name ?? details.penHouseName ?? 'Unassigned',
        farmZone: zoneById.get(String(pen?.farm_zone_id))?.name ?? details.farmZone ?? undefined,
        currentCount: Number(row.current_count), initialCount: Number(row.initial_count), dateOfBirth: row.placed_or_born_on ?? undefined,
        status: row.status, notes: row.notes ?? undefined, createdBy: String(row.created_by), createdAt: row.created_at,
        ...details,
      } as AnimalFlockHerd;
    }),
    pens: pens.filter(row => row.active).map(row => {
      const details = row.details as Row;
      const occupancy = groups.filter(group => group.pen_id === row.id && group.status === 'active').reduce((sum, group) => sum + Number(group.current_count), 0);
      return {
        id: String(row.id), name: row.name, type: row.pen_type, capacity: Number(row.capacity), currentOccupancy: occupancy,
        farmZone: zoneById.get(String(row.farm_zone_id))?.name ?? details.farmZone ?? undefined, ...details,
      } as PenHouse;
    }),
    eggRecords: [], eggSales: [], feedLogs: [], feedPlans: [], mortality: [], vaccinations: [], weights: [], milkRecords: [], livestockSales: [],
  };
  events.sort((a, b) => String(b.event_date).localeCompare(String(a.event_date))).forEach(event => {
    const key = STATE_KEY[event.event_kind];
    if (!key) return;
    const payload = event.payload as Row;
    const group = groupById.get(String(event.group_id));
    (result[key] as unknown[]).push({ ...payload, id: String(event.id), date: payload.date ?? event.event_date,
      ...(group && !payload.flockName && ['eggRecords', 'mortality'].includes(key) ? { flockName: group.name } : {}),
    });
  });
  return result;
}

export function subscribeSupabaseLivestock(organizationId: string, onData: (state: Omit<LivestockState, 'loading' | 'error'>) => void, onError: (error: Error) => void) {
  const client = db();
  let active = true;
  const refresh = async () => {
    try { const data = await load(organizationId); if (active) onData(data); }
    catch (error) { if (active) onError(error instanceof Error ? error : new Error('Unable to refresh livestock records')); }
  };
  let channel = client.channel(`livestock:${organizationId}:${crypto.randomUUID()}`);
  for (const table of ['livestock_pens', 'livestock_groups', 'livestock_events']) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `organization_id=eq.${organizationId}` }, () => void refresh());
  }
  channel.subscribe((status: string) => { if (status === 'SUBSCRIBED') void refresh(); });
  void refresh();
  return () => { active = false; void client.removeChannel(channel); };
}

async function resolveZone(organizationId: string, name?: string) {
  if (!name) return null;
  const { data, error } = await db().from('farm_zones').select('id').eq('organization_id', organizationId).ilike('name', name).limit(1).maybeSingle();
  check(error, 'Unable to resolve the farm zone');
  return data?.id ?? null;
}

export async function addSupabaseLivestockRecord<T extends { id: string }>(organizationId: string, userId: string, kind: LivestockRecordKind, record: T) {
  const { id: _id, ...data } = record as T & Row;
  if (kind === 'pen') {
    const pen = data as unknown as Omit<PenHouse, 'id'>;
    const { error } = await db().from('livestock_pens').insert({
      organization_id: organizationId, name: pen.name, pen_type: pen.type, capacity: pen.capacity,
      farm_zone_id: await resolveZone(organizationId, pen.farmZone),
      details: { species: pen.species, ventilationType: pen.ventilationType, flooringType: pen.flooringType, farmZone: pen.farmZone },
      created_by: userId,
    });
    return check(error, 'Unable to create the livestock pen');
  }
  if (kind === 'flock') {
    const flock = data as unknown as Omit<AnimalFlockHerd, 'id'>;
    const { error } = await db().from('livestock_groups').insert({
      organization_id: organizationId, pen_id: flock.penHouseId || null, name: flock.name, species: flock.species,
      breed: flock.breed || null, purpose: flock.purpose, initial_count: flock.initialCount, current_count: flock.currentCount,
      placed_or_born_on: flock.dateOfBirth || null, status: flock.status, notes: flock.notes || null,
      details: { ...flock, penHouseId: undefined, name: undefined, species: undefined, breed: undefined, purpose: undefined, initialCount: undefined, currentCount: undefined, dateOfBirth: undefined, status: undefined, notes: undefined },
      created_by: userId,
    });
    return check(error, 'Unable to create the livestock group');
  }
  const eventKind = EVENT_KIND[kind];
  if (!eventKind) throw new Error('Unsupported livestock record type');
  const groupId = data.flockId ?? data.flockHerdId ?? data.herdId ?? null;
  const eventDate = data.date ?? data.startDate ?? new Date().toISOString().slice(0, 10);
  const { error } = await db().rpc('record_livestock_event', {
    p_organization_id: organizationId, p_group_id: groupId, p_event_kind: eventKind,
    p_event_date: eventDate, p_payload: data, p_idempotency_key: crypto.randomUUID(),
  });
  check(error, 'Unable to save the livestock record');
}
