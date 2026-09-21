import { NextRequest, NextResponse } from 'next/server';

import { ApiError, requireUser } from '@/lib/api-auth';
import { getQuotaMode, getWhatsAppConfig, isCommsStoreConfigured } from '@/lib/comms/server/config';
import { readPlatformMessagingSnapshot, type PlatformMessagingSnapshot } from '@/lib/comms/server/repository';
import { adminDb } from '@/lib/firebase-admin';
import { getDataBackend, isSupabaseConfigured } from '@/lib/supabase/config';
import { isSupabaseReachable, readHeartbeats } from '@/lib/supabase/heartbeat';

/**
 * Operational status of the subsystems a super admin cannot see from the tenant UI:
 * which data backend is live, whether WhatsApp messaging can actually send, and how
 * many farms have made the app their own.
 *
 * Reports whether a secret is present, never its value.
 */
async function countBrandedOrganizations(): Promise<{ total: number; customized: number } | null> {
  if (getDataBackend() === 'supabase') return null;
  try {
    const snapshot = await adminDb.collection('organizations').select('appBranding').get();
    const customized = snapshot.docs.filter(document => {
      const branding = document.get('appBranding');
      return Boolean(branding && typeof branding === 'object' && Object.keys(branding).length > 0);
    }).length;
    return { total: snapshot.size, customized };
  } catch (error) {
    console.error('[admin] Could not count branded organizations:', error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (user.role !== 'super_admin') throw new ApiError('Super admin access is required', 403);

    const whatsapp = getWhatsAppConfig();
    const storeReady = isCommsStoreConfigured();

    let messagingSnapshot: PlatformMessagingSnapshot | null = null;
    let messagingError: string | null = null;
    if (storeReady) {
      try {
        messagingSnapshot = await readPlatformMessagingSnapshot();
      } catch (error) {
        messagingError = error instanceof Error ? error.message : 'The messaging tables could not be read.';
      }
    }

    return NextResponse.json({
      backend: {
        active: getDataBackend(),
        supabaseConfigured: isSupabaseConfigured(),
        secretKeyPresent: Boolean(process.env.SUPABASE_SECRET_KEY?.trim()),
        // A free project pauses after about a week without requests, so the last
        // heartbeat is the early warning.
        heartbeats: isSupabaseReachable() ? await readHeartbeats() : {},
      },
      messaging: {
        senderConfigured: Boolean(whatsapp),
        storeConfigured: storeReady,
        senderNumber: whatsapp?.displayPhoneNumber ?? null,
        graphApiVersion: whatsapp?.graphApiVersion ?? null,
        usesCustomGraphHost: Boolean(process.env.WHATSAPP_GRAPH_BASE_URL?.trim()),
        quotaMode: getQuotaMode(),
        schedulerSecretPresent: Boolean(process.env.CRON_SECRET?.trim()),
        snapshot: messagingSnapshot,
        error: messagingError,
      },
      apps: await countBrandedOrganizations(),
    });
  } catch (error) {
    if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[admin] Platform status failed:', error);
    return NextResponse.json({ error: 'Platform status could not be loaded.' }, { status: 500 });
  }
}
