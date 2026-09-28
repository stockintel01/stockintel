'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { getBrowserSupabaseClient } from '@/lib/supabase/browser';
import type { WaterRecord, WaterRecordInput } from './water-balance';

type Row = Record<string, any>;
const db = () => getBrowserSupabaseClient() as unknown as SupabaseClient;
const check = (error: { message?: string } | null, action: string) => { if (error) throw new Error(`${action}: ${error.message ?? 'operation failed'}`); };

function payload(organizationId: string, record: WaterRecordInput, source?: WaterRecord['source'], userId?: string) {
  return {
    organization_id: organizationId, sector_name: record.sectorName, plot_name: record.plotName, crop_name: record.cropName,
    record_date: record.date, rainfall_mm: record.rainfallMm, et0_mm: record.et0Mm,
    crop_coefficient: record.cropCoefficient, irrigation_mm: record.irrigationMm,
    effective_rainfall_percent: record.effectiveRainfallPercent,
    irrigation_efficiency_percent: record.irrigationEfficiencyPercent,
    trigger_deficit_mm: record.triggerDeficitMm, notes: record.notes || null,
    ...(source ? { source } : {}), ...(userId ? { created_by: userId } : {}),
  };
}

async function load(organizationId: string) {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from('water_records').select('*').eq('organization_id', organizationId)
      .order('record_date', { ascending: false }).range(from, from + 999);
    check(error, 'Unable to load water records');
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  const directory = await db().rpc('organization_member_directory', { p_organization_id: organizationId });
  check(directory.error, 'Unable to load water-record authors');
  const names = new Map((Array.isArray(directory.data) ? directory.data as Row[] : []).map(row => [String(row.userId), String(row.displayName)]));
  return rows.map(row => ({
    id: String(row.id), date: row.record_date, sectorName: row.sector_name, plotName: row.plot_name, cropName: row.crop_name,
    rainfallMm: Number(row.rainfall_mm), et0Mm: Number(row.et0_mm), cropCoefficient: Number(row.crop_coefficient),
    irrigationMm: Number(row.irrigation_mm), effectiveRainfallPercent: Number(row.effective_rainfall_percent),
    irrigationEfficiencyPercent: Number(row.irrigation_efficiency_percent), triggerDeficitMm: Number(row.trigger_deficit_mm),
    notes: row.notes ?? undefined, source: row.source === 'import' ? 'import' : 'manual', createdBy: String(row.created_by),
    createdByName: names.get(String(row.created_by)) ?? 'Team member', createdAt: row.created_at, updatedAt: row.updated_at,
  } satisfies WaterRecord));
}

export function subscribeSupabaseWaterRecords(organizationId: string, onData: (records: WaterRecord[], pending: boolean) => void, onError: (error: Error) => void) {
  const client = db();
  let active = true;
  const refresh = async () => {
    try { const records = await load(organizationId); if (active) onData(records, false); }
    catch (error) { if (active) onError(error instanceof Error ? error : new Error('Unable to refresh water records')); }
  };
  const channel = client.channel(`water:${organizationId}:${crypto.randomUUID()}`).on('postgres_changes', {
    event: '*', schema: 'public', table: 'water_records', filter: `organization_id=eq.${organizationId}`,
  }, () => void refresh()).subscribe((status: string) => { if (status === 'SUBSCRIBED') void refresh(); });
  void refresh();
  return () => { active = false; void client.removeChannel(channel); };
}

export async function addSupabaseWaterRecord(organizationId: string, record: WaterRecordInput, user: { id: string }, source: WaterRecord['source']) {
  const { error } = await db().from('water_records').insert(payload(organizationId, record, source, user.id));
  check(error, 'Unable to save the water record');
}

export async function addSupabaseWaterRecords(organizationId: string, records: WaterRecordInput[], user: { id: string }) {
  for (let start = 0; start < records.length; start += 500) {
    const { error } = await db().from('water_records').insert(records.slice(start, start + 500).map(record => payload(organizationId, record, 'import', user.id)));
    check(error, 'Unable to import water records');
  }
}

export async function updateSupabaseWaterRecord(organizationId: string, recordId: string, record: WaterRecordInput) {
  const { organization_id: _organizationId, ...changes } = payload(organizationId, record);
  const { error } = await db().from('water_records').update(changes).eq('organization_id', organizationId).eq('id', recordId);
  check(error, 'Unable to update the water record');
}

export async function deleteSupabaseWaterRecord(organizationId: string, recordId: string) {
  const { error } = await db().from('water_records').delete().eq('organization_id', organizationId).eq('id', recordId);
  check(error, 'Unable to delete the water record');
}
