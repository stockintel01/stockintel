import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { processPaystackEvent } from '@/lib/billing/paystack-events';
import { claimPaystackWebhookEvent, completePaystackWebhookEvent } from '@/lib/billing/paystack-repository';
import { verifyPaystackSignature } from '@/lib/payments/paystack';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifyPaystackSignature(rawBody, request.headers.get('x-paystack-signature'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: { event?: unknown; data?: unknown };
  try {
    payload = JSON.parse(rawBody) as { event?: unknown; data?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const eventType = String(payload.event ?? '').trim();
  if (!eventType || !payload.data || typeof payload.data !== 'object') {
    return NextResponse.json({ error: 'Invalid event payload' }, { status: 400 });
  }

  const payloadHash = createHash('sha256').update(rawBody).digest('hex');
  const eventKey = `${eventType}:${payloadHash}`;
  const claim = await claimPaystackWebhookEvent({ eventKey, eventType, payloadHash });
  if (claim !== 'claimed') return NextResponse.json({ received: true, duplicate: true });

  try {
    await processPaystackEvent(eventType, payload.data as Record<string, unknown>);
    await completePaystackWebhookEvent(eventKey, true);
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Paystack webhook processing failed';
    console.error('[Paystack webhook] processing failed:', error);
    try {
      await completePaystackWebhookEvent(eventKey, false, message);
    } catch (completionError) {
      console.error('[Paystack webhook] unable to record failure:', completionError);
    }
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
