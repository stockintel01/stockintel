import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { ConsentCategory, NotificationEventType } from '@/lib/comms/events';
import type { DeliveryStatus } from '@/lib/comms/meta';
import type { LinkOutcome } from '@/lib/comms/inbound';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export type Channel = 'whatsapp';

export interface OrganizationContext {
  organizationId: string;
  name: string;
  legacyFirebaseId: string | null;
  timezone: string;
  features: { whatsapp_notifications: boolean; whatsapp_messages: boolean };
}

export interface ChannelConnection {
  id: string;
  organization_id: string | null;
  channel: Channel;
  provider: 'meta_cloud';
  ownership: 'platform' | 'tenant';
  display_name: string;
  display_phone_number: string | null;
  provider_account_id: string;
  provider_sender_id: string;
  secret_ref: string;
  status: 'active' | 'disabled' | 'revoked';
}

export interface MessageTemplate {
  id: string;
  organization_id: string | null;
  template_key: string;
  provider_template_name: string;
  language_code: string;
  body_parameters: string[];
  status: string;
}

export interface ContactChannel {
  id: string;
  organization_id: string;
  channel: Channel;
  address: string;
  profile_id: string | null;
  firebase_uid: string | null;
  display_name: string | null;
  status: 'active' | 'unreachable' | 'revoked';
  verified_at: string;
}

export interface NotificationEvent {
  id: string;
  organization_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
  attempts: number;
}

export interface OutboxMessage {
  id: string;
  organization_id: string;
  event_id: string | null;
  connection_id: string;
  contact_channel_id: string;
  template_id: string | null;
  message_kind: 'template' | 'text';
  recipient_address: string;
  content: Record<string, unknown>;
  attempts: number;
}

export interface NotificationRule {
  enabled: boolean;
  audience: unknown;
}

export interface MemberIdentity {
  profileId: string | null;
  firebaseUid: string | null;
}

export interface UsageDecision {
  allowed: boolean;
  usage_total: number | null;
  usage_limit: number | null;
  limit_exceeded: boolean;
}

export class CommsStoreError extends Error {
  constructor(operation: string, public readonly code: string | undefined, message: string) {
    super(`${operation}: ${message}`);
  }
}

interface StoreError {
  message: string;
  code?: string;
}

// ReturnType<typeof createClient> resolves the schema to never, which rejects every
// write. Until generated database types exist, rows are cast to the interfaces above.
function db(): SupabaseClient {
  return getSupabaseAdminClient() as unknown as SupabaseClient;
}

function check(operation: string, error: StoreError | null): void {
  if (error) throw new CommsStoreError(operation, error.code, error.message);
}

const PAGE_SIZE = 1000;

// PostgREST caps responses at max_rows, so larger reads page through with ranges.
async function selectAllPages<T>(
  operation: string,
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: StoreError | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    check(operation, error);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
}

function matchesMember(query: { eq: (column: string, value: string) => unknown }, identity: MemberIdentity) {
  if (identity.profileId) return query.eq('profile_id', identity.profileId);
  if (identity.firebaseUid) return query.eq('firebase_uid', identity.firebaseUid);
  throw new CommsStoreError('member identity', undefined, 'a profile id or Firebase uid is required');
}

// ---------------------------------------------------------------------------
// Organizations and connections
// ---------------------------------------------------------------------------

export async function resolveLegacyOrganization(firebaseOrganizationId: string): Promise<string | null> {
  const { data, error } = await db().rpc('comms_resolve_legacy_organization', {
    p_legacy_firebase_id: firebaseOrganizationId,
  });
  check('resolve organization', error);
  return typeof data === 'string' ? data : null;
}

export async function getOrganizationContext(organizationId: string): Promise<OrganizationContext | null> {
  const { data, error } = await db().rpc('comms_organization_context', { p_organization_id: organizationId });
  check('load organization context', error);
  return (data as OrganizationContext | null) ?? null;
}

export async function getActivePlatformConnection(channel: Channel): Promise<ChannelConnection | null> {
  const { data, error } = await db()
    .from('channel_connections')
    .select('*')
    .eq('channel', channel)
    .eq('ownership', 'platform')
    .eq('status', 'active')
    .maybeSingle();
  check('load platform connection', error);
  return data as ChannelConnection | null;
}

export async function syncPlatformConnection(input: {
  channel: Channel;
  displayName: string;
  displayPhoneNumber: string;
  providerAccountId: string;
  providerSenderId: string;
  secretRef: string;
}): Promise<ChannelConnection> {
  const { data, error } = await db().rpc('comms_sync_platform_connection', {
    p_channel: input.channel,
    p_provider: 'meta_cloud',
    p_display_name: input.displayName,
    p_display_phone_number: input.displayPhoneNumber,
    p_provider_account_id: input.providerAccountId,
    p_provider_sender_id: input.providerSenderId,
    p_secret_ref: input.secretRef,
  });
  check('sync platform connection', error);
  return data as ChannelConnection;
}

export async function getConnection(connectionId: string): Promise<ChannelConnection | null> {
  const { data, error } = await db().from('channel_connections').select('*').eq('id', connectionId).maybeSingle();
  check('load connection', error);
  return data as ChannelConnection | null;
}

export async function findConnectionBySender(channel: Channel, providerSenderId: string): Promise<ChannelConnection | null> {
  const { data, error } = await db()
    .from('channel_connections')
    .select('*')
    .eq('channel', channel)
    .eq('provider_sender_id', providerSenderId)
    .eq('status', 'active')
    .maybeSingle();
  check('find connection', error);
  return data as ChannelConnection | null;
}

export async function listOrganizationsWithConsentedContacts(category: ConsentCategory): Promise<string[]> {
  const rows = await selectAllPages<{ organization_id: string }>('list consented organizations', (from, to) =>
    db()
      .from('communication_consents')
      .select('organization_id')
      .eq('category', category)
      .is('revoked_at', null)
      .order('organization_id')
      .range(from, to));
  return Array.from(new Set(rows.map(row => row.organization_id)));
}

// ---------------------------------------------------------------------------
// Queues
// ---------------------------------------------------------------------------

export async function claimNotificationEvents(batchSize: number, leaseSeconds: number, maxAttempts: number): Promise<NotificationEvent[]> {
  const { data, error } = await db().rpc('claim_notification_events', {
    p_batch_size: batchSize,
    p_lease_seconds: leaseSeconds,
    p_max_attempts: maxAttempts,
  });
  check('claim notification events', error);
  return (data ?? []) as NotificationEvent[];
}

export async function finishNotificationEvent(eventId: string, status: 'processed' | 'skipped', reason: string | null): Promise<void> {
  const { error } = await db()
    .from('notification_events')
    .update({ status, status_reason: reason, processed_at: new Date().toISOString(), lease_expires_at: null })
    .eq('id', eventId);
  check('finish notification event', error);
}

export async function releaseNotificationEvent(eventId: string, reason: string, delaySeconds: number): Promise<void> {
  const { error } = await db()
    .from('notification_events')
    .update({
      status: 'pending',
      status_reason: reason.slice(0, 200),
      lease_expires_at: null,
      next_attempt_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
    })
    .eq('id', eventId)
    .eq('status', 'processing');
  check('release notification event', error);
}

export async function deleteInboundReceipt(providerMessageId: string): Promise<void> {
  const { error } = await db().from('inbound_message_receipts').delete().eq('provider_message_id', providerMessageId);
  check('delete inbound receipt', error);
}

export async function claimOutboxMessages(batchSize: number, leaseSeconds: number, maxAttempts: number): Promise<OutboxMessage[]> {
  const { data, error } = await db().rpc('claim_message_outbox', {
    p_batch_size: batchSize,
    p_lease_seconds: leaseSeconds,
    p_max_attempts: maxAttempts,
  });
  check('claim outbox messages', error);
  return (data ?? []) as OutboxMessage[];
}

export async function markOutboxSent(messageId: string, providerMessageId: string): Promise<void> {
  const { error } = await db()
    .from('message_outbox')
    .update({
      status: 'sent',
      provider_message_id: providerMessageId,
      sent_at: new Date().toISOString(),
      lease_expires_at: null,
      last_error_code: null,
      last_error_message: null,
    })
    .eq('id', messageId)
    .eq('status', 'sending');
  check('mark message sent', error);
}

export async function scheduleOutboxRetry(messageId: string, delaySeconds: number, errorCode: string | null, errorMessage: string): Promise<void> {
  const { error } = await db()
    .from('message_outbox')
    .update({
      status: 'queued',
      next_attempt_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
      lease_expires_at: null,
      last_error_code: errorCode?.slice(0, 40) ?? null,
      last_error_message: errorMessage.slice(0, 500),
    })
    .eq('id', messageId)
    .eq('status', 'sending');
  check('schedule message retry', error);
}

export async function markOutboxFinal(
  messageId: string,
  status: 'failed' | 'suppressed',
  reason: string,
  errorCode: string | null = null,
  errorMessage: string | null = null,
): Promise<void> {
  const { error } = await db()
    .from('message_outbox')
    .update({
      status,
      status_reason: reason.slice(0, 200),
      failed_at: status === 'failed' ? new Date().toISOString() : null,
      lease_expires_at: null,
      last_error_code: errorCode?.slice(0, 40) ?? null,
      last_error_message: errorMessage?.slice(0, 500) ?? null,
    })
    .eq('id', messageId)
    .in('status', ['queued', 'sending']);
  check(`mark message ${status}`, error);
}

export async function recordDeliveryStatus(update: {
  providerMessageId: string;
  status: DeliveryStatus;
  timestamp: Date;
  errorCode: string | null;
  errorTitle: string | null;
  pricingCategory: string | null;
  billable: boolean | null;
}): Promise<string> {
  const { data, error } = await db().rpc('comms_record_delivery_status', {
    p_provider_message_id: update.providerMessageId,
    p_status: update.status,
    p_provider_timestamp: update.timestamp.toISOString(),
    p_error_code: update.errorCode,
    p_error_title: update.errorTitle,
    p_pricing_category: update.pricingCategory,
    p_billable: update.billable,
  });
  check('record delivery status', error);
  return String(data);
}

/** Returns false when this inbound message was already handled (Meta redelivered it). */
export async function recordInboundReceipt(providerMessageId: string, connectionId: string): Promise<boolean> {
  const { error } = await db()
    .from('inbound_message_receipts')
    .insert({ provider_message_id: providerMessageId, connection_id: connectionId });
  if (error?.code === '23505') return false;
  check('record inbound receipt', error);
  return true;
}

export async function linkContactChannel(input: {
  codeHash: string;
  address: string;
  connectionId: string;
  providerMessageId: string;
  receivedAt: Date;
}): Promise<{ outcome: LinkOutcome; organizationId?: string; organizationName?: string; contactChannelId?: string }> {
  const { data, error } = await db().rpc('comms_link_contact_channel', {
    p_code_hash: input.codeHash,
    p_address: input.address,
    p_connection_id: input.connectionId,
    p_provider_message_id: input.providerMessageId,
    p_received_at: input.receivedAt.toISOString(),
  });
  check('link contact channel', error);
  return data as { outcome: LinkOutcome; organizationId?: string; organizationName?: string; contactChannelId?: string };
}

export async function setKeywordConsent(input: {
  connectionId: string;
  address: string;
  granted: boolean;
  providerMessageId: string;
  receivedAt: Date;
}): Promise<{ changed: number; organizationNames: string[] }> {
  const { data, error } = await db().rpc('comms_set_keyword_consent', {
    p_connection_id: input.connectionId,
    p_address: input.address,
    p_granted: input.granted,
    p_provider_message_id: input.providerMessageId,
    p_received_at: input.receivedAt.toISOString(),
  });
  check('set keyword consent', error);
  return data as { changed: number; organizationNames: string[] };
}

export async function recordAuditEvent(input: {
  organizationId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details?: Record<string, unknown>;
  actorProfileId?: string | null;
}): Promise<void> {
  const { error } = await db().rpc('comms_record_audit_event', {
    p_organization_id: input.organizationId,
    p_action: input.action,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
    p_details: input.details ?? {},
    p_actor_id: input.actorProfileId ?? null,
  });
  check('record audit event', error);
}

export type OutboxStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'suppressed';

export interface PlatformMessagingSnapshot {
  queue: Record<OutboxStatus, number>;
  activeContacts: number;
  lastSentAt: string | null;
  templates: Array<{ templateKey: string; providerTemplateName: string; languageCode: string; status: string }>;
}

const OUTBOX_STATUSES: OutboxStatus[] = ['queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'suppressed'];

/** Platform-wide messaging health for the super admin console. Counts only, no message content. */
export async function readPlatformMessagingSnapshot(): Promise<PlatformMessagingSnapshot> {
  const queue = Object.fromEntries(OUTBOX_STATUSES.map(status => [status, 0])) as Record<OutboxStatus, number>;

  await Promise.all(OUTBOX_STATUSES.map(async status => {
    const { count, error } = await db()
      .from('message_outbox')
      .select('id', { count: 'exact', head: true })
      .eq('status', status);
    check('count outbox', error);
    queue[status] = count ?? 0;
  }));

  const [contacts, lastSent, templates] = await Promise.all([
    db().from('contact_channels').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    db().from('message_outbox').select('sent_at').not('sent_at', 'is', null).order('sent_at', { ascending: false }).limit(1),
    db().from('message_templates').select('template_key, provider_template_name, language_code, status').is('organization_id', null),
  ]);
  check('count contacts', contacts.error);
  check('read last send', lastSent.error);
  check('read templates', templates.error);

  return {
    queue,
    activeContacts: contacts.count ?? 0,
    lastSentAt: (lastSent.data as Array<{ sent_at: string }> | null)?.[0]?.sent_at ?? null,
    templates: ((templates.data ?? []) as Array<Record<string, string>>).map(row => ({
      templateKey: row.template_key,
      providerTemplateName: row.provider_template_name,
      languageCode: row.language_code,
      status: row.status,
    })),
  };
}

// ---------------------------------------------------------------------------
// Tenant-scoped access. Every query below is pinned to one organization.
// ---------------------------------------------------------------------------

export function forTenant(organizationId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) {
    throw new CommsStoreError('tenant scope', undefined, 'a valid organization id is required');
  }

  return {
    organizationId,

    async getRule(eventType: NotificationEventType, channel: Channel): Promise<NotificationRule | null> {
      const { data, error } = await db()
        .from('notification_rules')
        .select('enabled, audience')
        .eq('organization_id', organizationId)
        .eq('event_type', eventType)
        .eq('channel', channel)
        .maybeSingle();
      check('load notification rule', error);
      return data as NotificationRule | null;
    },

    async getTenantConnection(channel: Channel): Promise<ChannelConnection | null> {
      const { data, error } = await db()
        .from('channel_connections')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('channel', channel)
        .eq('ownership', 'tenant')
        .eq('status', 'active')
        .maybeSingle();
      check('load tenant connection', error);
      return data as ChannelConnection | null;
    },

    /** Templates belong to the sending account: the tenant's own for a tenant number, the platform's otherwise. */
    async findApprovedTemplate(connection: ChannelConnection, templateKey: string): Promise<MessageTemplate | null> {
      let query = db()
        .from('message_templates')
        .select('*')
        .eq('channel', connection.channel)
        .eq('template_key', templateKey)
        .eq('status', 'approved');
      query = connection.ownership === 'tenant'
        ? query.eq('organization_id', organizationId)
        : query.is('organization_id', null);
      const { data, error } = await query.order('language_code');
      check('load template', error);
      const templates = (data ?? []) as MessageTemplate[];
      return templates.find(template => template.language_code === 'en') ?? templates[0] ?? null;
    },

    async listReachableContacts(channel: Channel, category: ConsentCategory): Promise<ContactChannel[]> {
      const [contacts, consents] = await Promise.all([
        selectAllPages<ContactChannel>('list contacts', (from, to) =>
          db()
            .from('contact_channels')
            .select('id, organization_id, channel, address, profile_id, firebase_uid, display_name, status, verified_at')
            .eq('organization_id', organizationId)
            .eq('channel', channel)
            .eq('status', 'active')
            .order('id')
            .range(from, to)),
        selectAllPages<{ contact_channel_id: string }>('list consents', (from, to) =>
          db()
            .from('communication_consents')
            .select('contact_channel_id')
            .eq('organization_id', organizationId)
            .eq('category', category)
            .is('revoked_at', null)
            .order('contact_channel_id')
            .range(from, to)),
      ]);
      const consented = new Set(consents.map(consent => consent.contact_channel_id));
      return contacts.filter(contact => consented.has(contact.id));
    },

    async isContactReachable(contactChannelId: string, category: ConsentCategory): Promise<boolean> {
      const [contact, consent] = await Promise.all([
        db()
          .from('contact_channels')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('id', contactChannelId)
          .eq('status', 'active')
          .maybeSingle(),
        db()
          .from('communication_consents')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('contact_channel_id', contactChannelId)
          .eq('category', category)
          .is('revoked_at', null)
          .maybeSingle(),
      ]);
      check('check contact', contact.error);
      check('check consent', consent.error);
      return Boolean(contact.data && consent.data);
    },

    async countMessagesQueuedSince(since: Date): Promise<number> {
      const { count, error } = await db()
        .from('message_outbox')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .gte('queued_at', since.toISOString());
      check('count queued messages', error);
      return count ?? 0;
    },

    async consumeMessageUsage(idempotencyKey: string, enforceLimit: boolean, eventId: string): Promise<UsageDecision> {
      const { data, error } = await db().rpc('consume_feature_usage_system', {
        p_organization_id: organizationId,
        p_feature_key: 'whatsapp_messages',
        p_quantity: 1,
        p_idempotency_key: idempotencyKey,
        p_enforce_limit: enforceLimit,
        p_source_type: 'notification_event',
        p_source_id: eventId,
        p_metadata: {},
      });
      check('consume message usage', error);
      const decision = (Array.isArray(data) ? data[0] : data) as UsageDecision | undefined;
      return decision ?? { allowed: false, usage_total: null, usage_limit: null, limit_exceeded: false };
    },

    /** Returns the new message id, or null when a message with this idempotency key already exists. */
    async enqueueMessage(message: {
      eventId: string | null;
      connectionId: string;
      contactChannelId: string;
      templateId: string | null;
      kind: 'template' | 'text';
      recipientAddress: string;
      content: Record<string, unknown>;
      idempotencyKey: string;
      status?: 'queued' | 'suppressed';
      statusReason?: string | null;
    }): Promise<string | null> {
      const { data, error } = await db()
        .from('message_outbox')
        .upsert({
          organization_id: organizationId,
          event_id: message.eventId,
          connection_id: message.connectionId,
          contact_channel_id: message.contactChannelId,
          template_id: message.templateId,
          channel: 'whatsapp',
          message_kind: message.kind,
          recipient_address: message.recipientAddress,
          content: message.content,
          idempotency_key: message.idempotencyKey,
          status: message.status ?? 'queued',
          status_reason: message.statusReason ?? null,
        }, { onConflict: 'organization_id,idempotency_key', ignoreDuplicates: true })
        .select('id');
      check('enqueue message', error);
      return (data as Array<{ id: string }> | null)?.[0]?.id ?? null;
    },

    /** Returns true when the event is new. */
    async insertEvent(event: {
      eventType: NotificationEventType;
      payload: Record<string, unknown>;
      idempotencyKey: string;
      sourceType?: string | null;
      sourceId?: string | null;
    }): Promise<boolean> {
      const { data, error } = await db()
        .from('notification_events')
        .upsert({
          organization_id: organizationId,
          event_type: event.eventType,
          payload: event.payload,
          idempotency_key: event.idempotencyKey,
          source_type: event.sourceType ?? null,
          source_id: event.sourceId ?? null,
        }, { onConflict: 'organization_id,idempotency_key', ignoreDuplicates: true })
        .select('id');
      check('insert notification event', error);
      return Boolean((data as unknown[] | null)?.length);
    },

    async getMemberContact(identity: MemberIdentity, channel: Channel): Promise<(ContactChannel & { consented: boolean }) | null> {
      const query = db()
        .from('contact_channels')
        .select('id, organization_id, channel, address, profile_id, firebase_uid, display_name, status, verified_at')
        .eq('organization_id', organizationId)
        .eq('channel', channel)
        .neq('status', 'revoked');
      const { data, error } = await (matchesMember(query, identity) as typeof query).maybeSingle();
      check('load member contact', error);
      const contact = data as ContactChannel | null;
      if (!contact) return null;

      const consent = await db()
        .from('communication_consents')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('contact_channel_id', contact.id)
        .eq('category', 'operational')
        .is('revoked_at', null)
        .maybeSingle();
      check('load member consent', consent.error);
      return { ...contact, consented: Boolean(consent.data) };
    },

    async countLinkCodesSince(identity: MemberIdentity, since: Date): Promise<number> {
      const query = db()
        .from('contact_link_codes')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .gte('created_at', since.toISOString());
      const { count, error } = await (matchesMember(query, identity) as typeof query);
      check('count link codes', error);
      return count ?? 0;
    },

    /** Returns false if the code hash collided with an existing code. */
    async createLinkCode(input: {
      identity: MemberIdentity;
      channel: Channel;
      codeHash: string;
      displayName: string | null;
      expiresAt: Date;
    }): Promise<boolean> {
      const { error } = await db()
        .from('contact_link_codes')
        .insert({
          organization_id: organizationId,
          channel: input.channel,
          code_hash: input.codeHash,
          profile_id: input.identity.profileId,
          firebase_uid: input.identity.firebaseUid,
          display_name: input.displayName?.slice(0, 160) ?? null,
          expires_at: input.expiresAt.toISOString(),
        });
      if (error?.code === '23505') return false;
      check('create link code', error);
      return true;
    },

    async revokeMemberContact(identity: MemberIdentity, channel: Channel, reason: 'member_request' | 'membership_inactive' | 'administrator'): Promise<number> {
      const { data, error } = await db().rpc('comms_revoke_member_contact', {
        p_organization_id: organizationId,
        p_channel: channel,
        p_profile_id: identity.profileId,
        p_firebase_uid: identity.firebaseUid,
        p_reason: reason,
      });
      check('revoke member contact', error);
      return Number(data ?? 0);
    },

    async listActiveAlertStates(prefix: string): Promise<Array<{ alertKey: string; episodeStartedAt: string }>> {
      const rows = await selectAllPages<{ alert_key: string; episode_started_at: string }>('list alert states', (from, to) =>
        db()
          .from('notification_alert_states')
          .select('alert_key, episode_started_at')
          .eq('organization_id', organizationId)
          .eq('active', true)
          .like('alert_key', `${prefix}%`)
          .order('alert_key')
          .range(from, to));
      return rows
        .filter(row => row.alert_key.startsWith(prefix))
        .map(row => ({ alertKey: row.alert_key, episodeStartedAt: row.episode_started_at }));
    },

    async saveActiveAlertStates(states: Array<{ alertKey: string; episodeStartedAt: string; details: Record<string, unknown> }>, observedAt: Date): Promise<void> {
      if (!states.length) return;
      const { error } = await db()
        .from('notification_alert_states')
        .upsert(states.map(state => ({
          organization_id: organizationId,
          alert_key: state.alertKey,
          active: true,
          episode_started_at: state.episodeStartedAt,
          last_observed_at: observedAt.toISOString(),
          resolved_at: null,
          details: state.details,
        })), { onConflict: 'organization_id,alert_key' });
      check('save alert states', error);
    },

    async resolveAlertStates(alertKeys: string[], resolvedAt: Date): Promise<void> {
      if (!alertKeys.length) return;
      const { error } = await db()
        .from('notification_alert_states')
        .update({ active: false, resolved_at: resolvedAt.toISOString(), last_observed_at: resolvedAt.toISOString() })
        .eq('organization_id', organizationId)
        .in('alert_key', alertKeys);
      check('resolve alert states', error);
    },
  };
}

export type TenantStore = ReturnType<typeof forTenant>;
