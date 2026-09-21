import 'server-only';

import type { AuthenticatedUser } from '@/lib/api-auth';
import { getWhatsAppConfig, isCommsStoreConfigured, type WhatsAppConfig } from '@/lib/comms/server/config';
import * as store from '@/lib/comms/server/repository';

export type MemberComms =
  | { state: 'unavailable'; reason: 'not_configured' | 'unsupported_account' | 'not_migrated'; message: string }
  | {
    state: 'ready' | 'feature_disabled';
    message: string | null;
    config: WhatsAppConfig;
    context: store.OrganizationContext;
    tenant: store.TenantStore;
    identity: store.MemberIdentity;
  };

/**
 * Resolves the signed-in member's farm to its communication-layer organization. The
 * organization always comes from the verified session, never from the request body.
 */
export async function resolveMemberComms(user: AuthenticatedUser): Promise<MemberComms> {
  const config = getWhatsAppConfig();
  if (!config || !isCommsStoreConfigured()) {
    return { state: 'unavailable', reason: 'not_configured', message: 'WhatsApp alerts are not set up yet.' };
  }
  if (user.role === 'super_admin' || !user.organizationId) {
    return { state: 'unavailable', reason: 'unsupported_account', message: 'Sign in with a farm team account to connect WhatsApp.' };
  }

  const organizationId = await store.resolveLegacyOrganization(user.organizationId);
  const context = organizationId ? await store.getOrganizationContext(organizationId) : null;
  if (!organizationId || !context) {
    return {
      state: 'unavailable',
      reason: 'not_migrated',
      message: 'WhatsApp alerts will be available once this farm has moved to the new data store.',
    };
  }

  const enabled = context.features.whatsapp_notifications;
  return {
    state: enabled ? 'ready' : 'feature_disabled',
    message: enabled ? null : "Your farm's current plan doesn't include WhatsApp alerts.",
    config,
    context,
    tenant: store.forTenant(organizationId),
    identity: { profileId: null, firebaseUid: user.uid },
  };
}
