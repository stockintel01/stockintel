import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { normalizeAppBranding, type AppBranding } from '@/lib/branding/app-branding';
import { adminDb } from '@/lib/firebase-admin';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getDataBackend, isSupabaseConfigured } from '@/lib/supabase/config';

export interface OrganizationBranding {
  organizationName: string;
  branding: AppBranding;
}

/** Firestore document ids and Supabase uuids; anything else is not looked up. */
export function isOrganizationId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function supabaseBackendActive(): boolean {
  return getDataBackend() === 'supabase' && isSupabaseConfigured() && Boolean(process.env.SUPABASE_SECRET_KEY?.trim());
}

async function readFromSupabase(organizationId: string): Promise<OrganizationBranding | null> {
  const client = getSupabaseAdminClient() as unknown as SupabaseClient;
  const { data, error } = await client.rpc('organization_app_branding', { p_organization_id: organizationId });
  if (error || !data) return null;
  const record = data as { name?: string; appBranding?: unknown };
  return {
    organizationName: record.name ?? '',
    branding: normalizeAppBranding(record.appBranding, record.name ?? ''),
  };
}

async function readFromFirebase(organizationId: string): Promise<OrganizationBranding | null> {
  const snapshot = await adminDb.collection('organizations').doc(organizationId).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() ?? {};
  const name = typeof data.name === 'string' ? data.name : '';
  return { organizationName: name, branding: normalizeAppBranding(data.appBranding, name) };
}

/** Returns null when the farm is unknown, so callers can fall back to the platform default. */
export async function readOrganizationBranding(organizationId: string): Promise<OrganizationBranding | null> {
  if (!isOrganizationId(organizationId)) return null;
  try {
    return supabaseBackendActive() ? await readFromSupabase(organizationId) : await readFromFirebase(organizationId);
  } catch (error) {
    console.error('[branding] Could not read organization branding:', error);
    return null;
  }
}

export async function writeOrganizationBranding(organizationId: string, branding: AppBranding): Promise<void> {
  if (!isOrganizationId(organizationId)) throw new Error('A valid organization is required.');

  if (supabaseBackendActive()) {
    const client = getSupabaseAdminClient() as unknown as SupabaseClient;
    const { error } = await client.rpc('set_organization_app_branding', {
      p_organization_id: organizationId,
      p_branding: branding,
    });
    if (error) throw new Error(error.message);
    return;
  }

  await adminDb.collection('organizations').doc(organizationId).set(
    { appBranding: branding, updatedAt: new Date() },
    { merge: true },
  );
}
