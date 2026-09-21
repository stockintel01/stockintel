import { after, NextRequest, NextResponse } from 'next/server';

import { parseMetaWebhook, verifyMetaSignature } from '@/lib/comms/meta';
import { getWhatsAppConfig, isCommsStoreConfigured, safeEqual } from '@/lib/comms/server/config';
import { handleWhatsAppWebhook, type FollowUps } from '@/lib/comms/server/webhook';

/** Meta calls this once, when the webhook is subscribed, to confirm we own the endpoint. */
export async function GET(request: NextRequest) {
  const config = getWhatsAppConfig();
  if (!config) return new NextResponse('WhatsApp is not configured', { status: 503 });

  const params = request.nextUrl.searchParams;
  const token = params.get('hub.verify_token') ?? '';
  if (params.get('hub.mode') !== 'subscribe' || !safeEqual(token, config.webhookVerifyToken)) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  return new NextResponse(params.get('hub.challenge') ?? '', {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export async function POST(request: NextRequest) {
  const config = getWhatsAppConfig();
  if (!config || !isCommsStoreConfigured()) {
    return NextResponse.json({ error: 'WhatsApp messaging is not configured' }, { status: 503 });
  }

  // The signature covers the exact bytes Meta sent, so verify before decoding anything.
  const rawBody = new Uint8Array(await request.arrayBuffer());
  if (!verifyMetaSignature(rawBody, request.headers.get('x-hub-signature-256'), config.appSecret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const followUps: FollowUps = [];
  after(async () => {
    for (const task of followUps) {
      await task().catch(error => console.error('[comms] Webhook follow-up failed:', error));
    }
  });

  try {
    const result = await handleWhatsAppWebhook(parseMetaWebhook(payload), config, followUps);
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    // A non-2xx response makes Meta redeliver; receipts and idempotent writes absorb the repeat.
    console.error('[comms] WhatsApp webhook processing failed:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
