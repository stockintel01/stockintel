import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export interface HeartbeatRecord {
  at: string;
  source: string;
}

/**
 * Free Plan projects with low activity may pause after a seven-day window. The daily
 * heartbeat supplies database activity and makes the last successful contact visible.
 * A paid Supabase plan remains the only guaranteed protection from auto-pausing.
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
