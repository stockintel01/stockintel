import { NextRequest, NextResponse } from 'next/server';

import { getWhatsAppConfig, isAuthorizedCronRequest, isCommsStoreConfigured } from '@/lib/comms/server/config';
import { runDispatchCycle } from '@/lib/comms/server/worker';

// Leaves headroom inside the 60-second function limit set in vercel.json.
const BUDGET_MS = 45_000;

/** Turns queued events into messages and sends due messages. Schedule every minute. */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const config = getWhatsAppConfig();
  if (!config || !isCommsStoreConfigured()) {
    return NextResponse.json({ skipped: 'WhatsApp messaging is not configured' });
  }

  try {
    return NextResponse.json(await runDispatchCycle(config, BUDGET_MS));
  } catch (error) {
    console.error('[comms] Dispatch run failed:', error);
    return NextResponse.json({ error: 'Dispatch run failed' }, { status: 500 });
  }
}
