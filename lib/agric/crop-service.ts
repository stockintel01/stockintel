'use client';

import { addDoc, collection, onSnapshot, serverTimestamp } from 'firebase/firestore';

import { db as firebaseDb } from '@/lib/firebase';
import { getBrowserSupabaseClient } from '@/lib/supabase/browser';
import { isSupabaseBackendActive } from '@/lib/supabase/config';

export interface CropPlanRecord {
  id: string;
  cropName: string;
  fieldName: string;
  season: string;
  startDate: string;
  expectedHarvestDate: string;
  status: 'planned' | 'planted' | 'growing' | 'harvesting' | 'completed';
  progress: number;
  notes?: string;
}

type CropPlanInput = Omit<CropPlanRecord, 'id'>;

function mapSupabaseCropPlan(row: Record<string, unknown>): CropPlanRecord {
  const details = row.details && typeof row.details === 'object' ? row.details as Record<string, unknown> : {};
  const fallbackStatus = row.status === 'completed' ? 'completed' : row.status === 'draft' ? 'planned' : 'growing';
  const status = ['planned', 'planted', 'growing', 'harvesting', 'completed'].includes(String(details.status))
    ? String(details.status) as CropPlanRecord['status']
    : fallbackStatus;
  return {
    id: String(row.id),
    cropName: String(row.crop_name ?? ''),
    fieldName: String(details.fieldName ?? ''),
    season: String(details.season ?? ''),
    startDate: String(row.planted_on ?? ''),
    expectedHarvestDate: String(row.expected_harvest_on ?? ''),
    status,
    progress: Math.max(0, Math.min(100, Number(details.progress ?? 0))),
    notes: String(details.notes ?? ''),
  };
}

async function loadSupabaseCropPlans(organizationId: string) {
  const { data, error } = await getBrowserSupabaseClient().from('crop_plans')
    .select('id, crop_name, planted_on, expected_harvest_on, status, details')
    .eq('organization_id', organizationId)
    .neq('status', 'archived')
    .order('planted_on', { ascending: true })
    .range(0, 999);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Record<string, unknown>) => mapSupabaseCropPlan(row));
}

export function subscribeCropPlans(
  organizationId: string,
  onData: (plans: CropPlanRecord[]) => void,
  onError: (error: Error) => void,
) {
  if (!isSupabaseBackendActive()) {
    return onSnapshot(collection(firebaseDb, `organizations/${organizationId}/agric_crop_plans`), snapshot => {
      onData(snapshot.docs.map(document => ({ id: document.id, ...document.data() } as CropPlanRecord)).sort((a, b) => a.startDate.localeCompare(b.startDate)));
    }, error => onError(error));
  }

  const client = getBrowserSupabaseClient();
  let active = true;
  let loading = false;
  let rerun = false;
  const refresh = async () => {
    if (!active) return;
    if (loading) { rerun = true; return; }
    loading = true;
    try { onData(await loadSupabaseCropPlans(organizationId)); }
    catch (error) { if (active) onError(error instanceof Error ? error : new Error('Unable to load crop plans')); }
    finally {
      loading = false;
      if (rerun) { rerun = false; void refresh(); }
    }
  };
  const channel = client.channel(`crop-plans:${organizationId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'crop_plans', filter: `organization_id=eq.${organizationId}` }, () => void refresh())
    .subscribe((status: string) => { if (status === 'SUBSCRIBED') void refresh(); });
  void refresh();
  return () => { active = false; void client.removeChannel(channel); };
}

export async function addCropPlan(organizationId: string, userId: string, plan: CropPlanInput) {
  if (!isSupabaseBackendActive()) {
    await addDoc(collection(firebaseDb, `organizations/${organizationId}/agric_crop_plans`), {
      ...plan,
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return;
  }

  const client = getBrowserSupabaseClient();
  const { data: zones, error: zoneError } = await client.from('farm_zones')
    .select('id')
    .eq('organization_id', organizationId)
    .ilike('name', plan.fieldName)
    .limit(1);
  if (zoneError) throw new Error(zoneError.message);
  const databaseStatus = plan.status === 'completed'
    ? 'completed'
    : plan.status === 'planned'
      ? 'draft'
      : 'active';
  const { error } = await client.from('crop_plans').insert({
    organization_id: organizationId,
    farm_zone_id: zones?.[0]?.id ?? null,
    crop_name: plan.cropName,
    planted_on: plan.startDate,
    expected_harvest_on: plan.expectedHarvestDate || null,
    status: databaseStatus,
    details: {
      fieldName: plan.fieldName,
      season: plan.season,
      status: plan.status,
      progress: plan.progress,
      notes: plan.notes ?? '',
    },
    created_by: userId,
  });
  if (error) throw new Error(error.message);
}
