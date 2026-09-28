'use client';

import type { SupabaseClient } from '@supabase/supabase-js';

import { getBrowserSupabaseClient } from '@/lib/supabase/browser';
import type {
  PackingCrewProfile,
  PackingFulfilmentPlan,
  PackingInspectionStatus,
  PackingQualityConfig,
  PackingQualityEvent,
  PackingStation,
  PackingTransportProfile,
} from './types';

type Unsub = () => void;
type Row = Record<string, any>;

function db(): SupabaseClient {
  return getBrowserSupabaseClient() as unknown as SupabaseClient;
}

function check(error: { message?: string } | null, action: string) {
  if (error) throw new Error(`${action}: ${error.message ?? 'operation failed'}`);
}

function databaseUuid(value?: string) {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

async function currentUserId() {
  const { data, error } = await db().auth.getUser();
  check(error, 'Unable to verify your session');
  if (!data.user) throw new Error('Authentication required');
  return data.user.id;
}

async function pagedRows(
  table: string,
  organizationId: string,
  columns = '*',
  order?: { column: string; ascending?: boolean },
) {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    let query = db().from(table).select(columns).eq('organization_id', organizationId);
    if (order) query = query.order(order.column, { ascending: order.ascending ?? true });
    const { data, error } = await query.range(from, from + 999);
    check(error, `Unable to load ${table}`);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) return rows;
  }
}

function subscribeTables<T>(input: {
  organizationId: string;
  tables: string[];
  load: () => Promise<T>;
  onData: (value: T) => void;
  onError?: (error: Error) => void;
}): Unsub {
  const client = db();
  let active = true;
  let loading = false;
  let rerun = false;
  const refresh = async () => {
    if (!active) return;
    if (loading) { rerun = true; return; }
    loading = true;
    try {
      const value = await input.load();
      if (active) input.onData(value);
    } catch (error) {
      if (active) input.onError?.(error instanceof Error ? error : new Error('Unable to refresh packing data'));
    } finally {
      loading = false;
      if (rerun) { rerun = false; void refresh(); }
    }
  };

  let channel = client.channel(`packing:${input.tables.join('-')}:${input.organizationId}:${crypto.randomUUID()}`);
  for (const table of input.tables) {
    const filterColumn = table === 'organizations' ? 'id' : 'organization_id';
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `${filterColumn}=eq.${input.organizationId}` },
      () => void refresh(),
    );
  }
  channel.subscribe((status: string) => { if (status === 'SUBSCRIBED') void refresh(); });
  void refresh();
  return () => { active = false; void client.removeChannel(channel); };
}

export function subscribeSupabasePackingFulfilmentPlans(
  organizationId: string,
  onData: (items: PackingFulfilmentPlan[]) => void,
  onError?: (error: Error) => void,
) {
  return subscribeTables({
    organizationId,
    tables: ['packing_fulfilment_plans', 'packing_stations', 'farm_zones'],
    onData,
    onError,
    load: async () => {
      const [plans, stations, zones] = await Promise.all([
        pagedRows('packing_fulfilment_plans', organizationId, '*', { column: 'start_date' }),
        pagedRows('packing_stations', organizationId),
        pagedRows('farm_zones', organizationId),
      ]);
      const stationNames = new Map(stations.map(row => [String(row.id), String(row.name)]));
      const zoneNames = new Map(zones.map(row => [String(row.id), String(row.name)]));
      return plans.map(row => ({
        id: String(row.id),
        activityName: String(row.activity_name),
        customerName: String(row.customer_name),
        destinationName: row.destination_name ? String(row.destination_name) : undefined,
        stationId: String(row.station_id),
        stationName: stationNames.get(String(row.station_id)) ?? 'Packing station',
        farmZone: (zoneNames.get(String(row.farm_zone_id)) ?? 'Unassigned') as PackingFulfilmentPlan['farmZone'],
        produce: String(row.produce),
        market: row.market,
        destinationCountry: row.destination_country ?? undefined,
        targetBoxes: Number(row.target_packages),
        startDate: String(row.start_date),
        dueTime: row.due_time ? String(row.due_time).slice(0, 5) : undefined,
        recurrence: row.recurrence,
        endDate: row.end_date ?? undefined,
        shipmentRequired: Boolean(row.shipment_required),
        crewProfileId: row.crew_profile_id ?? undefined,
        transportProfileId: row.transport_profile_id ?? undefined,
        status: (row.status === 'archived' ? 'archived' : row.status === 'paused' ? 'paused' : 'active') as PackingFulfilmentPlan['status'],
        notes: row.notes ?? undefined,
        createdBy: String(row.created_by),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    },
  });
}

export function subscribeSupabasePackingCrewProfiles(
  organizationId: string,
  onData: (items: PackingCrewProfile[]) => void,
  onError?: (error: Error) => void,
) {
  return subscribeTables({
    organizationId,
    tables: ['packing_crew_profiles', 'packing_crew_members'],
    onData,
    onError,
    load: async () => {
      const [profiles, members] = await Promise.all([
        pagedRows('packing_crew_profiles', organizationId, '*', { column: 'name' }),
        pagedRows('packing_crew_members', organizationId),
      ]);
      return profiles.filter(row => row.active).map(row => ({
        id: String(row.id),
        name: String(row.name),
        workers: members.filter(member => member.crew_id === row.id)
          .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
          .map(member => String(member.worker_name)),
        isActive: Boolean(row.active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    },
  });
}

export function subscribeSupabasePackingTransportProfiles(
  organizationId: string,
  onData: (items: PackingTransportProfile[]) => void,
  onError?: (error: Error) => void,
) {
  return subscribeTables({
    organizationId,
    tables: ['transport_profiles'],
    onData,
    onError,
    load: async () => (await pagedRows('transport_profiles', organizationId, '*', { column: 'label' }))
      .filter(row => row.active)
      .map(row => ({
        id: String(row.id),
        label: String(row.label),
        vehicleId: String(row.vehicle_identifier),
        driverName: String(row.driver_name),
        isActive: Boolean(row.active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
  });
}

export function subscribeSupabasePackingQualityEvents(
  organizationId: string,
  onData: (items: PackingQualityEvent[]) => void,
  onError?: (error: Error) => void,
) {
  return subscribeTables({
    organizationId,
    tables: ['packing_quality_events', 'packing_records', 'packing_stations'],
    onData,
    onError,
    load: async () => {
      const [events, records, stations] = await Promise.all([
        pagedRows('packing_quality_events', organizationId, '*', { column: 'inspected_at', ascending: false }),
        pagedRows('packing_records', organizationId),
        pagedRows('packing_stations', organizationId),
      ]);
      const recordsById = new Map(records.map(row => [String(row.id), row]));
      const stationsById = new Map(stations.map(row => [String(row.id), row]));
      return events.map(row => {
        const record = recordsById.get(String(row.packing_record_id)) ?? {};
        const station = stationsById.get(String(record.station_id)) ?? {};
        const standard = record.quality_standard_snapshot && typeof record.quality_standard_snapshot === 'object'
          ? record.quality_standard_snapshot as Row
          : {};
        return {
          id: String(row.id),
          packingRecordId: String(row.packing_record_id),
          eventType: row.event_type,
          stationId: String(record.station_id ?? ''),
          stationName: String(station.name ?? 'Packing station'),
          produce: String(record.produce ?? ''),
          market: record.market,
          destinationCountry: record.destination_country ?? undefined,
          qualityStandardId: record.quality_standard_id ?? undefined,
          qualityStandardName: standard.name ?? undefined,
          qualityStandardAuthority: standard.authority ?? undefined,
          qualityStandardReference: standard.reference ?? undefined,
          qualityStandardVersion: standard.version ?? undefined,
          qualityStandardSourceUrl: standard.sourceUrl ?? undefined,
          confirmedChecks: row.confirmed_checks ?? [],
          packageType: String(record.package_type ?? ''),
          packageSize: record.package_size ?? undefined,
          qualityGrade: String(record.quality_grade ?? ''),
          lotNumber: String(record.lot_number ?? ''),
          palletId: record.pallet_id ?? undefined,
          storageLocation: record.storage_location ?? undefined,
          packedDelta: 0,
          inspectedDelta: Number(row.inspected_delta),
          acceptedDelta: Number(row.accepted_delta),
          rejectedDelta: Number(row.rejected_delta),
          reworkDelta: Number(row.rework_delta),
          reason: row.reason ?? undefined,
          notes: row.notes ?? undefined,
          inspectorId: String(row.inspector_id),
          inspectorName: String(row.inspector_name),
          inspectedAt: String(row.inspected_at),
          createdAt: row.created_at,
        } satisfies PackingQualityEvent;
      });
    },
  });
}

export function subscribeSupabasePackingQualityConfig(
  organizationId: string,
  onData: (config: PackingQualityConfig | null) => void,
  onError?: (error: Error) => void,
) {
  return subscribeTables({
    organizationId,
    tables: ['organizations'],
    onData,
    onError,
    load: async () => {
      const { data, error } = await db().from('organizations').select('settings').eq('id', organizationId).single();
      check(error, 'Unable to load packing quality settings');
      const settings = data?.settings && typeof data.settings === 'object' ? data.settings as Row : {};
      const config = settings.packingQualityConfig;
      return config && typeof config === 'object'
        ? { id: 'main', ...(config as Omit<PackingQualityConfig, 'id'>) }
        : null;
    },
  });
}

async function zoneId(organizationId: string, name: string) {
  const { data, error } = await db().from('farm_zones').select('id')
    .eq('organization_id', organizationId).eq('name', name).maybeSingle();
  check(error, 'Unable to resolve the farm zone');
  return data?.id ?? null;
}

export async function saveSupabasePackingFulfilmentPlan(
  organizationId: string,
  plan: Omit<PackingFulfilmentPlan, 'id' | 'createdAt' | 'updatedAt'>,
  id?: string,
) {
  const payload: Row = {
    organization_id: organizationId,
    activity_name: plan.activityName,
    customer_name: plan.customerName,
    destination_name: plan.destinationName || null,
    station_id: plan.stationId,
    farm_zone_id: await zoneId(organizationId, plan.farmZone),
    produce: plan.produce,
    market: plan.market ?? 'local',
    destination_country: plan.market === 'export' ? plan.destinationCountry : null,
    target_packages: plan.targetBoxes,
    start_date: plan.startDate,
    due_time: plan.dueTime || null,
    recurrence: plan.recurrence,
    end_date: plan.endDate || null,
    shipment_required: plan.shipmentRequired,
    crew_profile_id: plan.crewProfileId || null,
    transport_profile_id: plan.transportProfileId || null,
    status: plan.status,
    notes: plan.notes || null,
  };
  if (id) {
    const { error } = await db().from('packing_fulfilment_plans').update(payload).eq('id', id).eq('organization_id', organizationId);
    check(error, 'Unable to update the packing schedule');
    return id;
  }
  payload.created_by = plan.createdBy || await currentUserId();
  const { data, error } = await db().from('packing_fulfilment_plans').insert(payload).select('id').single();
  check(error, 'Unable to create the packing schedule');
  return String(data?.id);
}

export async function saveSupabasePackingCrewProfile(
  organizationId: string,
  profile: Omit<PackingCrewProfile, 'id' | 'createdAt' | 'updatedAt'>,
  id?: string,
) {
  const userId = await currentUserId();
  let crewId = id ?? '';
  if (crewId) {
    const { error } = await db().from('packing_crew_profiles').update({ name: profile.name, active: profile.isActive }).eq('id', crewId).eq('organization_id', organizationId);
    check(error, 'Unable to update the packing crew');
  } else {
    const { data, error } = await db().from('packing_crew_profiles').insert({ organization_id: organizationId, name: profile.name, active: profile.isActive, created_by: userId }).select('id').single();
    check(error, 'Unable to create the packing crew');
    crewId = String(data?.id);
  }
  const { error: deleteError } = await db().from('packing_crew_members').delete().eq('crew_id', crewId).eq('organization_id', organizationId);
  check(deleteError, 'Unable to replace packing crew members');
  if (profile.workers.length > 0) {
    const { error } = await db().from('packing_crew_members').insert(profile.workers.map((workerName, index) => ({
      organization_id: organizationId,
      crew_id: crewId,
      worker_name: workerName,
      sort_order: index,
    })));
    check(error, 'Unable to save packing crew members');
  }
  return crewId;
}

export async function saveSupabasePackingTransportProfile(
  organizationId: string,
  profile: Omit<PackingTransportProfile, 'id' | 'createdAt' | 'updatedAt'>,
  id?: string,
) {
  const payload: Row = {
    organization_id: organizationId,
    label: profile.label,
    vehicle_identifier: profile.vehicleId,
    driver_name: profile.driverName,
    active: profile.isActive,
  };
  if (id) {
    const { error } = await db().from('transport_profiles').update(payload).eq('id', id).eq('organization_id', organizationId);
    check(error, 'Unable to update the transport profile');
    return id;
  }
  payload.created_by = await currentUserId();
  const { data, error } = await db().from('transport_profiles').insert(payload).select('id').single();
  check(error, 'Unable to create the transport profile');
  return String(data?.id);
}

export async function setSupabasePackingPlanStatus(organizationId: string, id: string, status: PackingFulfilmentPlan['status']) {
  const { error } = await db().from('packing_fulfilment_plans').update({ status }).eq('id', id).eq('organization_id', organizationId);
  check(error, 'Unable to update the packing schedule');
}

export async function saveSupabasePackingQualityConfig(
  organizationId: string,
  config: Omit<PackingQualityConfig, 'id' | 'updatedAt'>,
) {
  const client = db();
  const { data, error: readError } = await client.from('organizations').select('settings').eq('id', organizationId).single();
  check(readError, 'Unable to load packing settings');
  const settings = data?.settings && typeof data.settings === 'object' ? data.settings as Row : {};
  const { error } = await client.from('organizations').update({ settings: { ...settings, packingQualityConfig: config } }).eq('id', organizationId);
  check(error, 'Unable to save packing quality settings');
}

export async function recordSupabasePackingQualityEvent(
  organizationId: string,
  event: Omit<PackingQualityEvent, 'id' | 'createdAt'>,
  _status: PackingInspectionStatus,
) {
  const standardSnapshot = {
    id: event.qualityStandardId,
    name: event.qualityStandardName,
    authority: event.qualityStandardAuthority,
    reference: event.qualityStandardReference,
    version: event.qualityStandardVersion,
    sourceUrl: event.qualityStandardSourceUrl,
  };
  const { error } = await db().rpc('record_packing_quality_event_with_details', {
    p_packing_record_id: event.packingRecordId,
    p_event_type: event.eventType,
    p_inspected_delta: event.inspectedDelta,
    p_accepted_delta: event.acceptedDelta,
    p_rejected_delta: event.rejectedDelta,
    p_rework_delta: event.reworkDelta,
    p_confirmed_checks: event.confirmedChecks ?? [],
    p_reason: event.reason ?? null,
    p_notes: event.notes ?? null,
    p_inspected_at: event.inspectedAt,
    p_correction_of: null,
    p_idempotency_key: crypto.randomUUID(),
    p_package_type: event.packageType,
    p_package_size: event.packageSize ?? null,
    p_quality_grade: event.qualityGrade,
    p_lot_number: event.lotNumber,
    p_pallet_id: event.palletId ?? null,
    p_storage_location: event.storageLocation ?? null,
    p_market: event.market ?? 'local',
    p_destination_country: event.destinationCountry ?? null,
    // Built-in standards use stable public identifiers. Only tenant-created
    // standards have database UUIDs; both are preserved in the snapshot.
    p_quality_standard_id: databaseUuid(event.qualityStandardId),
    p_quality_standard_snapshot: standardSnapshot,
    p_details: { inspectionNotes: event.notes ?? '' },
  });
  check(error, 'Unable to record the packing quality event');
}

export async function deleteSupabasePackingCrewProfile(organizationId: string, id: string) {
  const { error } = await db().from('packing_crew_profiles').update({ active: false }).eq('id', id).eq('organization_id', organizationId);
  check(error, 'Unable to archive the packing crew');
}

export async function deleteSupabasePackingTransportProfile(organizationId: string, id: string) {
  const { error } = await db().from('transport_profiles').update({ active: false }).eq('id', id).eq('organization_id', organizationId);
  check(error, 'Unable to archive the transport profile');
}

export function subscribeSupabasePackingStations(
  organizationId: string,
  onData: (items: PackingStation[]) => void,
  onError?: (error: Error) => void,
) {
  return subscribeTables({
    organizationId,
    tables: ['packing_stations', 'packing_station_members'],
    onData,
    onError,
    load: async () => {
      const [stations, assignments, directoryResult] = await Promise.all([
        pagedRows('packing_stations', organizationId, '*', { column: 'name' }),
        pagedRows('packing_station_members', organizationId),
        db().rpc('organization_member_directory', { p_organization_id: organizationId }),
      ]);
      check(directoryResult.error, 'Unable to load packing station members');
      const directory = Array.isArray(directoryResult.data) ? directoryResult.data as Row[] : [];
      const names = new Map(directory.map(member => [String(member.userId), String(member.displayName)]));
      return stations.map(row => {
        const assigned = assignments.filter(item => item.station_id === row.id).map(item => String(item.user_id));
        return {
          id: String(row.id),
          name: String(row.name),
          storageName: row.storage_name ?? undefined,
          assignedUserIds: assigned,
          assignedUserNames: assigned.map(id => names.get(id) ?? 'Team member'),
          isActive: Boolean(row.active),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        } satisfies PackingStation;
      });
    },
  });
}

export async function loadSupabasePackingTeamMembers(organizationId: string) {
  const { data, error } = await db().rpc('organization_member_directory', { p_organization_id: organizationId });
  check(error, 'Unable to load workspace members');
  return (Array.isArray(data) ? data as Row[] : []).filter(member => member.active).map(member => ({
    id: String(member.userId),
    name: String(member.displayName || 'Team member'),
    email: '',
  }));
}

export async function saveSupabasePackingStation(organizationId: string, station: {
  id?: string;
  name: string;
  storageName?: string;
  assignedUserIds: string[];
}) {
  const userId = await currentUserId();
  let stationId = station.id ?? '';
  if (stationId) {
    const { error } = await db().from('packing_stations').update({
      name: station.name,
      storage_name: station.storageName || null,
      active: true,
    }).eq('id', stationId).eq('organization_id', organizationId);
    check(error, 'Unable to update the packing station');
  } else {
    const { data, error } = await db().from('packing_stations').insert({
      organization_id: organizationId,
      name: station.name,
      storage_name: station.storageName || null,
      active: true,
      created_by: userId,
    }).select('id').single();
    check(error, 'Unable to create the packing station');
    stationId = String(data?.id);
  }

  const { error: deleteError } = await db().from('packing_station_members').delete()
    .eq('organization_id', organizationId).eq('station_id', stationId);
  check(deleteError, 'Unable to replace station assignments');
  if (station.assignedUserIds.length > 0) {
    const { error } = await db().from('packing_station_members').insert(station.assignedUserIds.map(memberId => ({
      organization_id: organizationId,
      station_id: stationId,
      user_id: memberId,
      assigned_by: userId,
    })));
    check(error, 'Unable to save station assignments');
  }
  return stationId;
}

export async function deleteSupabasePackingStation(organizationId: string, stationId: string) {
  const { error } = await db().from('packing_stations').update({ active: false })
    .eq('id', stationId)
    .eq('organization_id', organizationId);
  check(error, 'Unable to archive the packing station');
}
