'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { getBrowserSupabaseClient } from '@/lib/supabase/browser';
import {
  calculateSigatokaMetrics,
  normalizeSigatokaAdvancedStageObservation,
  type SigatokaLeafScore,
  type SigatokaSessionRecord,
} from './sigatoka';

type Row = Record<string, any>;
const db = () => getBrowserSupabaseClient() as unknown as SupabaseClient;
const check = (error: { message?: string } | null, action: string) => { if (error) throw new Error(`${action}: ${error.message ?? 'operation failed'}`); };

async function rows(table: string, organizationId: string, order?: { column: string; ascending?: boolean }) {
  const result: Row[] = [];
  for (let from = 0; ; from += 1000) {
    let query = db().from(table).select('*').eq('organization_id', organizationId);
    if (order) query = query.order(order.column, { ascending: order.ascending ?? true });
    const { data, error } = await query.range(from, from + 999);
    check(error, `Unable to load ${table}`);
    result.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) return result;
  }
}

function score(row?: Row): SigatokaLeafScore | null {
  return row?.disease_stage && row?.density ? { stage: Number(row.disease_stage) as SigatokaLeafScore['stage'], density: row.density } : null;
}

export async function loadSupabaseSigatokaSessions(organizationId: string): Promise<SigatokaSessionRecord[]> {
  const [observations, plots, plants, scores, advanced, sentinels] = await Promise.all([
    rows('sigatoka_observations', organizationId, { column: 'observed_on', ascending: false }),
    rows('sigatoka_plots', organizationId), rows('sigatoka_plant_observations', organizationId),
    rows('sigatoka_leaf_scores', organizationId), rows('sigatoka_advanced_stage_counts', organizationId),
    rows('sigatoka_sentinel_plants', organizationId),
  ]);
  const plotById = new Map(plots.map(row => [String(row.id), row]));
  const sentinelById = new Map(sentinels.map(row => [String(row.id), row]));
  return observations.map(observation => {
    const plot = plotById.get(String(observation.plot_id));
    const linkedPlants = plants.filter(plant => plant.observation_id === observation.id).sort((a, b) => Number(a.plant_number) - Number(b.plant_number));
    const mappedPlants = linkedPlants.map(plant => {
      const leafScores = scores.filter(item => item.plant_observation_id === plant.id);
      const sentinel = sentinelById.get(String(plant.sentinel_plant_id));
      return {
        plantNumber: Number(plant.plant_number), sentinelPlantId: plant.sentinel_plant_id ?? undefined,
        sentinelPlantCode: sentinel?.code ?? undefined,
        previousLeafReading: Number(plant.previous_leaf_reading), currentLeafReading: Number(plant.current_leaf_reading),
        leaf2: score(leafScores.find(item => Number(item.leaf_position) === 2)),
        leaf3: score(leafScores.find(item => Number(item.leaf_position) === 3)),
        leaf4: score(leafScores.find(item => Number(item.leaf_position) === 4)),
        youngestInfestedLeaf: plant.youngest_infested_leaf == null ? null : Number(plant.youngest_infested_leaf),
        youngestNecroticLeaf: plant.youngest_necrotic_leaf == null ? null : Number(plant.youngest_necrotic_leaf),
        leavesAtFlowering: plant.leaves_at_flowering == null ? null : Number(plant.leaves_at_flowering),
        leavesAtHarvest: plant.leaves_at_harvest == null ? null : Number(plant.leaves_at_harvest), notes: plant.notes ?? undefined,
      };
    });
    const advancedRows = advanced.filter(item => item.observation_id === observation.id).sort((a, b) => Number(a.leaf_number) - Number(b.leaf_number));
    const advancedSentinel = advancedRows[0]?.sentinel_plant_id;
    const advancedPlant = linkedPlants.find(item => item.sentinel_plant_id === advancedSentinel);
    const storedMetrics = {
      meanRawFer: Number(observation.mean_raw_fer), fer10d: Number(observation.fer_10d), previousFinalFer: Number(observation.previous_final_fer),
      finalFer: Number(observation.final_fer), coefficientLeaf2: Number(observation.coefficient_leaf_2), coefficientLeaf3: Number(observation.coefficient_leaf_3),
      coefficientLeaf4: Number(observation.coefficient_leaf_4), grossCoefficient: Number(observation.gross_coefficient), sed: Number(observation.sed),
      averageYil: observation.average_yil == null ? null : Number(observation.average_yil), averageYnl: observation.average_ynl == null ? null : Number(observation.average_ynl),
      averageNlf: observation.average_nlf == null ? null : Number(observation.average_nlf), averageNlh: observation.average_nlh == null ? null : Number(observation.average_nlh),
      highDensityCount: Number(observation.high_density_count),
    };
    const recomputed = calculateSigatokaMetrics(mappedPlants, Number(observation.interval_days), storedMetrics.previousFinalFer, observation.mean_raw_fer_override == null ? undefined : Number(observation.mean_raw_fer_override));
    const advancedStageObservation = advancedRows.length && advancedPlant ? normalizeSigatokaAdvancedStageObservation({
      plantNumber: Number(advancedPlant.plant_number), sentinelPlantId: String(advancedSentinel),
      leafCounts: advancedRows.map(row => ({
        leafNumber: Number(row.leaf_number), stage4Count: row.stage_4_count == null ? null : Number(row.stage_4_count),
        stage5Count: row.stage_5_count == null ? null : Number(row.stage_5_count), stage6Count: row.stage_6_count == null ? null : Number(row.stage_6_count),
      })),
    }, mappedPlants) : null;
    return {
      id: String(observation.id), sectorName: String(plot?.sector_name ?? 'Sector'), plotName: String(plot?.name ?? 'Plot'),
      plotArea: plot?.area == null ? null : Number(plot.area), plotAreaSquareMetres: plot?.area_square_metres == null ? null : Number(plot.area_square_metres),
      areaUnit: String(plot?.area_unit ?? 'hectare'), observedAt: observation.observed_on,
      monitoringWeek: Number(observation.monitoring_week), monitoringYear: Number(observation.monitoring_year),
      observerId: String(observation.observer_id), observerName: String(observation.observer_name), intervalDays: Number(observation.interval_days),
      meanRawFerOverride: observation.mean_raw_fer_override == null ? null : Number(observation.mean_raw_fer_override),
      status: observation.status === 'verified' ? 'verified' : observation.status === 'submitted' ? 'submitted' : 'draft',
      plants: mappedPlants, advancedStageObservation, metrics: { ...recomputed, ...storedMetrics },
      rainfallMm: observation.rainfall_mm == null ? null : Number(observation.rainfall_mm), treatment: observation.treatment ?? null,
      notes: observation.notes ?? undefined, verifiedBy: observation.verified_by ?? undefined, verifiedAt: observation.verified_at ?? undefined,
      archivedAt: observation.archived_at ?? undefined, archivedAtIso: observation.archived_at ?? undefined,
      archivedBy: observation.archived_by ?? undefined, archiveReason: observation.archive_reason ?? undefined,
      archiveBatchId: observation.archive_batch_id ?? undefined, expireAt: observation.purge_after ?? undefined,
      createdAt: observation.created_at, updatedAt: observation.updated_at,
    } satisfies SigatokaSessionRecord;
  });
}

export function subscribeSupabaseSigatokaSessions(organizationId: string, onData: (sessions: SigatokaSessionRecord[], pending: boolean) => void, onError?: (error: Error) => void) {
  const client = db();
  let active = true;
  const refresh = async () => {
    try { const data = await loadSupabaseSigatokaSessions(organizationId); if (active) onData(data, false); }
    catch (error) { if (active) onError?.(error instanceof Error ? error : new Error('Unable to refresh disease scouting')); }
  };
  const tables = ['sigatoka_observations', 'sigatoka_plots', 'sigatoka_plant_observations', 'sigatoka_leaf_scores', 'sigatoka_advanced_stage_counts'];
  let channel = client.channel(`sigatoka:${organizationId}:${crypto.randomUUID()}`);
  for (const table of tables) channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `organization_id=eq.${organizationId}` }, () => void refresh());
  channel.subscribe((status: string) => { if (status === 'SUBSCRIBED') void refresh(); });
  void refresh();
  return () => { active = false; void client.removeChannel(channel); };
}

export async function saveSupabaseSigatokaSession(organizationId: string, session: Omit<SigatokaSessionRecord, 'id' | 'createdAt' | 'updatedAt'>, observationId?: string) {
  const { data, error } = await db().rpc('save_sigatoka_observation', {
    p_organization_id: organizationId, p_sheet: session, p_observation_id: observationId ?? null,
  });
  check(error, 'Unable to save the disease scouting sheet');
  return String(data);
}

export async function updateSupabaseSigatokaStatus(organizationId: string, sessionId: string, status: SigatokaSessionRecord['status'], metrics?: SigatokaSessionRecord['metrics']) {
  const payload: Row = { status, verified_by: status === 'verified' ? (await db().auth.getUser()).data.user?.id ?? null : null, verified_at: status === 'verified' ? new Date().toISOString() : null };
  if (metrics) Object.assign(payload, {
    mean_raw_fer: metrics.meanRawFer, fer_10d: metrics.fer10d, previous_final_fer: metrics.previousFinalFer,
    final_fer: metrics.finalFer, coefficient_leaf_2: metrics.coefficientLeaf2, coefficient_leaf_3: metrics.coefficientLeaf3,
    coefficient_leaf_4: metrics.coefficientLeaf4, gross_coefficient: metrics.grossCoefficient, sed: metrics.sed,
    average_yil: metrics.averageYil, average_ynl: metrics.averageYnl, average_nlf: metrics.averageNlf,
    average_nlh: metrics.averageNlh, high_density_count: metrics.highDensityCount, calculation_version: metrics.calculationVersion,
  });
  const { error } = await db().from('sigatoka_observations').update(payload).eq('organization_id', organizationId).eq('id', sessionId);
  check(error, 'Unable to update scouting status');
}

export async function updateSupabaseSigatokaSession(organizationId: string, sessionId: string, changes: Partial<Omit<SigatokaSessionRecord, 'id' | 'createdAt' | 'updatedAt'>>, clearVerification = false) {
  const current = (await loadSupabaseSigatokaSessions(organizationId)).find(item => item.id === sessionId);
  if (!current) throw new Error('Scouting observation not found');
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...base } = current;
  const merged = { ...base, ...changes, ...(clearVerification ? { verifiedBy: undefined, verifiedAt: undefined } : {}) };
  await saveSupabaseSigatokaSession(organizationId, merged, sessionId);
}

export async function manageSupabaseSigatokaSession(organizationId: string, sessionId: string, action: 'archive' | 'restore' | 'permanent_delete', reason?: string, batchId?: string) {
  const { data, error: readError } = await db().from('sigatoka_observations').select('id').eq('organization_id', organizationId).eq('id', sessionId).maybeSingle();
  check(readError, 'Unable to verify the scouting observation');
  if (!data) throw new Error('Scouting observation not found');
  const { error } = await db().rpc('manage_sigatoka_observation', {
    p_observation_id: sessionId, p_action: action, p_reason: reason ?? null, p_batch_id: batchId ?? null,
  });
  check(error, `Unable to ${action.replaceAll('_', ' ')} the scouting observation`);
}
