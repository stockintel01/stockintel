import { NextRequest, NextResponse } from 'next/server';

import { getWhatsAppConfig, isAuthorizedCronRequest, isCommsStoreConfigured } from '@/lib/comms/server/config';
import { runDispatchCycle, scanLowStock } from '@/lib/comms/server/worker';

const SCAN_BUDGET_MS = 30_000;
const DISPATCH_BUDGET_MS = 15_000;

/**
 * Checks stock levels for farms with connected WhatsApp contacts. Schedule every 15
 * minutes. It also dispatches afterwards, so alerts go out even if the per-minute
 * dispatch schedule isn't running.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const config = getWhatsAppConfig();
  if (!config || !isCommsStoreConfigured()) {
    return NextResponse.json({ skipped: 'WhatsApp messaging is not configured' });
  }

  try {
    const scan = await scanLowStock(config, SCAN_BUDGET_MS);
    const dispatch = await runDispatchCycle(config, DISPATCH_BUDGET_MS);
    return NextResponse.json({ scan, ...dispatch });
  } catch (error) {
    console.error('[comms] Low-stock scan run failed:', error);
    return NextResponse.json({ error: 'Scan run failed' }, { status: 500 });
  }
}
