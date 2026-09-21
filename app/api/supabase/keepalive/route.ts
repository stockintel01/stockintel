import { NextRequest, NextResponse } from 'next/server';

import { isAuthorizedCronRequest } from '@/lib/comms/server/config';
import { isSupabaseReachable, recordHeartbeat } from '@/lib/supabase/heartbeat';

/**
 * Keeps the Supabase project from pausing for inactivity, and records when it was last
 * reached. Schedule daily; the project pauses after about a week without requests.
 *
 * Returns 200 even when Supabase is not configured, so a scheduler does not report a
 * failure for a deployment that has not been given Supabase credentials yet.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isSupabaseReachable()) {
    return NextResponse.json({ skipped: 'Supabase is not configured for this deployment' });
  }

  try {
    const heartbeat = await recordHeartbeat('keepalive');
    return NextResponse.json({ ok: true, ...heartbeat });
  } catch (error) {
    // A failure here is the early warning that the project is paused or unreachable.
    console.error('[supabase] Keep-alive failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The Supabase project could not be reached.' },
      { status: 503 },
    );
  }
}
