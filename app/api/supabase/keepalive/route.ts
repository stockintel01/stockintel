import { NextRequest, NextResponse } from 'next/server';

import { isAuthorizedCronRequest } from '@/lib/comms/server/config';
import { isSupabaseReachable, readHeartbeats, recordHeartbeat } from '@/lib/supabase/heartbeat';
import { isSupabaseBackendActive } from '@/lib/supabase/config';

/**
 * Generates several real database requests each day and records the last successful
 * contact. Supabase currently describes a few daily requests as typically sufficient
 * activity for a Free Plan project, though only a paid plan guarantees no auto-pause.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isSupabaseReachable()) {
    const message = 'Supabase keep-alive is not configured for this deployment';
    return NextResponse.json(
      isSupabaseBackendActive() ? { error: message } : { skipped: message },
      {
        status: isSupabaseBackendActive() ? 503 : 200,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }

  try {
    const first = await recordHeartbeat('keepalive');
    await readHeartbeats();
    const heartbeat = await recordHeartbeat('keepalive');
    return NextResponse.json(
      { ok: true, requests: 3, previousAt: first.at, ...heartbeat },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    // A failure here is the early warning that the project is paused or unreachable.
    console.error('[supabase] Keep-alive failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The Supabase project could not be reached.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
