import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export interface HeartbeatRecord {
  at: string;
  source: string;
}

/**
 * A free Supabase project pauses after roughly a week without requests, and this
 * application does not call Supabase at all while Firebase serves farm data. A
 * scheduled heartbeat keeps the project active and makes the last contact visible.
 */
export function isSupabaseReachable(): boolean {
  return isSupabaseConfigured() && Boolean(process.env.SUPABASE_SECRET_KEY?.trim());
}

function client(): SupabaseClient {
  return getSupabaseAdminClient() as unknown as SupabaseClient;
}

export async function recordHeartbeat(source = 'keepalive'): Promise<HeartbeatRecord> {
  const { data, error } = await client().rpc('record_platform_heartbeat', { p_source: source });
  if (error) throw new Error(error.message);
  return data as HeartbeatRecord;
}

/** Returns an empty map rather than throwing, so a status screen still renders. */
export async function readHeartbeats(): Promise<Record<string, HeartbeatRecord>> {
  try {
    const { data, error } = await client().rpc('platform_heartbeats');
    if (error) throw new Error(error.message);
    return (data ?? {}) as Record<string, HeartbeatRecord>;
  } catch (error) {
    console.error('[supabase] Could not read heartbeats:', error);
    return {};
  }
}
