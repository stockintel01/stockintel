import 'server-only';

import {
  NOTIFICATION_EVENTS,
  contactBelongsToMember,
  isNotificationEventType,
  resolveAudience,
  selectAudience,
  type NotificationEventDefinition,
} from '@/lib/comms/events';
import {
  LOW_STOCK_ALERT_PREFIX,
  diffLowStockEpisodes,
  findLowStockItems,
  lowStockAlertKey,
  lowStockEventKey,
  parseLowStockPayload,
  renderLowStockTemplateParameters,
  scanWindowStart,
} from '@/lib/comms/low-stock';
import { retryDelaySeconds } from '@/lib/comms/meta';
import { toWhatsAppRecipient } from '@/lib/comms/phone';
import {
  COMMS_LIMITS,
  PLATFORM_DISPLAY_NAME,
  PLATFORM_SECRET_REF,
  getQuotaMode,
  resolveConnectionSecret,
  type WhatsAppConfig,
} from '@/lib/comms/server/config';
import { getTenantDirectory } from '@/lib/comms/server/directory';
import { notify } from '@/lib/comms/server/notify';
import { createMetaCloudProvider, type WhatsAppProvider } from '@/lib/comms/server/provider';
import * as store from '@/lib/comms/server/repository';

const CHANNEL = 'whatsapp' as const;

export interface EventReport {
  processed: number;
  skipped: Record<string, number>;
  queued: number;
  errors: number;
}

export interface DispatchReport {
  sent: number;
  retried: number;
  failed: number;
  suppressed: number;
}

export interface ScanReport {
  organizations: number;
  scanned: number;
  events: number;
  deferred: number;
  errors: number;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Keeps the platform sender row in step with environment configuration. */
export async function ensurePlatformConnection(config: WhatsAppConfig): Promise<store.ChannelConnection> {
  const current = await store.getActivePlatformConnection(CHANNEL);
  if (current
    && current.provider_sender_id === config.phoneNumberId
    && current.provider_account_id === config.businessAccountId
    && current.display_phone_number === config.displayPhoneNumber
    && current.secret_ref === PLATFORM_SECRET_REF) {
    return current;
  }
  return store.syncPlatformConnection({
    channel: CHANNEL,
    displayName: PLATFORM_DISPLAY_NAME,
    displayPhoneNumber: config.displayPhoneNumber,
    providerAccountId: config.businessAccountId,
    providerSenderId: config.phoneNumberId,
    secretRef: PLATFORM_SECRET_REF,
  });
}

async function resolveSender(tenant: store.TenantStore, platform: store.ChannelConnection): Promise<store.ChannelConnection> {
  return (await tenant.getTenantConnection(CHANNEL)) ?? platform;
}

function renderParameters(definition: NotificationEventDefinition, event: store.NotificationEvent, context: store.OrganizationContext): string[] | null {
  switch (definition.type) {
    case 'inventory.low_stock': {
      const items = parseLowStockPayload(event.payload);
      return items.length ? renderLowStockTemplateParameters(context.name, items) : null;
    }
  }
}

// ---------------------------------------------------------------------------
// Events → messages
// ---------------------------------------------------------------------------

type FanOutOutcome = { status: 'processed'; queued: number } | { status: 'skipped'; reason: string };

async function fanOutEvent(event: store.NotificationEvent, platform: store.ChannelConnection): Promise<FanOutOutcome> {
  if (!isNotificationEventType(event.event_type)) return { status: 'skipped', reason: 'unknown_event_type' };
  const definition = NOTIFICATION_EVENTS[event.event_type];

  const context = await store.getOrganizationContext(event.organization_id);
  if (!context) return { status: 'skipped', reason: 'organization_unavailable' };
  if (!context.features.whatsapp_notifications) return { status: 'skipped', reason: 'feature_disabled' };

  const tenant = store.forTenant(event.organization_id);
  const rule = await tenant.getRule(definition.type, CHANNEL);
  if (rule && !rule.enabled) return { status: 'skipped', reason: 'rule_disabled' };

  const sender = await resolveSender(tenant, platform);
  const template = await tenant.findApprovedTemplate(sender, definition.templateKey);
  if (!template) return { status: 'skipped', reason: 'template_not_approved' };

  const parameters = renderParameters(definition, event, context);
  if (!parameters) return { status: 'skipped', reason: 'invalid_payload' };

  const [members, contacts] = await Promise.all([
    getTenantDirectory(context).listMembers(),
    tenant.listReachableContacts(CHANNEL, definition.consentCategory),
  ]);
  const recipients = selectAudience(members, resolveAudience(definition.defaultAudience, rule?.audience));
  const targets = contacts.filter(contact => recipients.some(member =>
    contactBelongsToMember({ profileId: contact.profile_id, firebaseUid: contact.firebase_uid }, member)));
  if (!targets.length) return { status: 'skipped', reason: 'no_reachable_recipients' };

  let capacity = COMMS_LIMITS.dailyMessagesPerOrganization - await tenant.countMessagesQueuedSince(startOfUtcDay(new Date()));
  const enforceQuota = getQuotaMode() === 'enforce';
  let queued = 0;

  for (const contact of targets) {
    const idempotencyKey = `event:${event.id}:contact:${contact.id}`;
    let status: 'queued' | 'suppressed' = 'queued';
    let reason: string | null = null;
    let overLimit = false;

    if (capacity <= 0) {
      status = 'suppressed';
      reason = 'daily_cap_reached';
    } else {
      const usage = await tenant.consumeMessageUsage(`outbox:${idempotencyKey}`, enforceQuota, event.id);
      overLimit = usage.limit_exceeded;
      if (!usage.allowed) {
        status = 'suppressed';
        reason = usage.limit_exceeded ? 'quota_exceeded' : 'messages_not_included';
      }
    }

    const messageId = await tenant.enqueueMessage({
      eventId: event.id,
      connectionId: sender.id,
      contactChannelId: contact.id,
      templateId: template.id,
      kind: 'template',
      recipientAddress: contact.address,
      content: {
        templateName: template.provider_template_name,
        languageCode: template.language_code,
        bodyParameters: parameters,
      },
      idempotencyKey,
      status,
      statusReason: reason,
    });
    if (!messageId) continue;

    await store.recordAuditEvent({
      organizationId: event.organization_id,
      action: status === 'queued' ? 'message.queued' : 'message.suppressed',
      entityType: 'message_outbox',
      entityId: messageId,
      details: { eventId: event.id, eventType: event.event_type, reason, overLimit },
    });
    if (status === 'queued') {
      queued += 1;
      capacity -= 1;
    }
  }

  return { status: 'processed', queued };
}

export async function processNotificationEvents(platform: store.ChannelConnection, deadline: number): Promise<EventReport> {
  const report: EventReport = { processed: 0, skipped: {}, queued: 0, errors: 0 };

  while (Date.now() < deadline) {
    const events = await store.claimNotificationEvents(COMMS_LIMITS.batchSize, COMMS_LIMITS.leaseSeconds, COMMS_LIMITS.maxEventAttempts);
    for (const event of events) {
      try {
        const outcome = await fanOutEvent(event, platform);
        if (outcome.status === 'processed') {
          await store.finishNotificationEvent(event.id, 'processed', null);
          report.processed += 1;
          report.queued += outcome.queued;
        } else {
          await store.finishNotificationEvent(event.id, 'skipped', outcome.reason);
          report.skipped[outcome.reason] = (report.skipped[outcome.reason] ?? 0) + 1;
        }
      } catch (error) {
        report.errors += 1;
        console.error('[comms] Event fan-out failed', event.id, error);
        await store.releaseNotificationEvent(event.id, describeError(error), retryDelaySeconds(event.attempts, 'transient'))
          .catch(releaseError => console.error('[comms] Could not release event', event.id, releaseError));
      }
    }
    if (events.length < COMMS_LIMITS.batchSize) break;
  }
  return report;
}

// ---------------------------------------------------------------------------
// Messages → WhatsApp
// ---------------------------------------------------------------------------

interface SenderRuntime {
  connection: store.ChannelConnection | null;
  provider: WhatsAppProvider | null;
}

function readContent(message: store.OutboxMessage):
  | { kind: 'template'; templateName: string; languageCode: string; bodyParameters: string[] }
  | { kind: 'text'; body: string }
  | null {
  const content = message.content;
  if (message.message_kind === 'text') {
    return typeof content.text === 'string' && content.text ? { kind: 'text', body: content.text } : null;
  }
  const { templateName, languageCode, bodyParameters } = content;
  if (typeof templateName !== 'string' || typeof languageCode !== 'string' || !Array.isArray(bodyParameters)
    || !bodyParameters.every(parameter => typeof parameter === 'string')) {
    return null;
  }
  return { kind: 'template', templateName, languageCode, bodyParameters: bodyParameters as string[] };
}

export async function dispatchOutbox(config: WhatsAppConfig, deadline: number, limit = Number.POSITIVE_INFINITY): Promise<DispatchReport> {
  const report: DispatchReport = { sent: 0, retried: 0, failed: 0, suppressed: 0 };
  const senders = new Map<string, SenderRuntime>();
  // After a rate-limit response, nothing else goes to that sender in this run.
  const rateLimited = new Set<string>();
  let claimed = 0;

  async function senderFor(connectionId: string): Promise<SenderRuntime> {
    const cached = senders.get(connectionId);
    if (cached) return cached;
    const connection = await store.getConnection(connectionId);
    const accessToken = connection ? resolveConnectionSecret(connection.secret_ref) : null;
    const runtime: SenderRuntime = {
      connection,
      provider: connection && accessToken
        ? createMetaCloudProvider({
          accessToken,
          phoneNumberId: connection.provider_sender_id,
          graphApiVersion: config.graphApiVersion,
          graphBaseUrl: config.graphBaseUrl,
        })
        : null,
    };
    senders.set(connectionId, runtime);
    return runtime;
  }

  async function finalize(message: store.OutboxMessage, status: 'failed' | 'suppressed', reason: string, code: string | null = null, detail: string | null = null) {
    await store.markOutboxFinal(message.id, status, reason, code, detail);
    await store.recordAuditEvent({
      organizationId: message.organization_id,
      action: status === 'failed' ? 'message.failed' : 'message.suppressed',
      entityType: 'message_outbox',
      entityId: message.id,
      details: { reason, errorCode: code },
    });
    report[status] += 1;
  }

  async function retryOrFail(message: store.OutboxMessage, kind: 'transient' | 'rate_limited', code: string | null, detail: string) {
    if (message.attempts >= COMMS_LIMITS.maxMessageAttempts) {
      await finalize(message, 'failed', 'attempts_exhausted', code, detail);
      return;
    }
    await store.scheduleOutboxRetry(message.id, retryDelaySeconds(message.attempts, kind), code, detail);
    report.retried += 1;
  }

  async function deliver(message: store.OutboxMessage) {
    const { connection, provider } = await senderFor(message.connection_id);
    if (!connection || connection.status !== 'active') return finalize(message, 'failed', 'connection_inactive');
    if (rateLimited.has(connection.id)) return retryOrFail(message, 'rate_limited', null, 'Sender was rate limited earlier in this run');
    if (!provider) return retryOrFail(message, 'transient', 'missing_credentials', 'The sender has no usable access token');

    const content = readContent(message);
    if (!content) return finalize(message, 'failed', 'invalid_content');

    // Consent is checked at send time too: someone may have replied STOP after queueing.
    const tenant = store.forTenant(message.organization_id);
    if (!(await tenant.isContactReachable(message.contact_channel_id, 'operational'))) {
      return finalize(message, 'suppressed', 'consent_revoked');
    }

    const to = toWhatsAppRecipient(message.recipient_address);
    const result = content.kind === 'template'
      ? await provider.sendTemplate({ to, templateName: content.templateName, languageCode: content.languageCode, bodyParameters: content.bodyParameters })
      : await provider.sendText({ to, body: content.body });

    if (result.ok) {
      await store.markOutboxSent(message.id, result.providerMessageId);
      await store.recordAuditEvent({
        organizationId: message.organization_id,
        action: 'message.sent',
        entityType: 'message_outbox',
        entityId: message.id,
        details: { kind: message.message_kind },
      });
      report.sent += 1;
      return;
    }

    if (result.kind === 'rate_limited') {
      rateLimited.add(connection.id);
      return retryOrFail(message, 'rate_limited', result.code, result.message);
    }
    if (result.kind === 'transient') return retryOrFail(message, 'transient', result.code, result.message);
    if (result.kind === 'auth') {
      console.error('[comms] WhatsApp rejected the sender credentials', connection.id, result.code, result.message);
    }
    return finalize(message, 'failed', result.kind === 'auth' ? 'sender_unauthorized' : 'provider_rejected', result.code, result.message);
  }

  while (Date.now() < deadline && claimed < limit) {
    const requested = Math.min(COMMS_LIMITS.batchSize, limit - claimed);
    const batch = await store.claimOutboxMessages(requested, COMMS_LIMITS.leaseSeconds, COMMS_LIMITS.maxMessageAttempts);
    claimed += batch.length;
    for (const message of batch) {
      try {
        await deliver(message);
      } catch (error) {
        // The lease expires and the message is claimed again on a later run.
        console.error('[comms] Message delivery failed', message.id, error);
      }
    }
    if (batch.length < requested) break;
  }
  return report;
}

export async function runDispatchCycle(config: WhatsAppConfig, budgetMs: number): Promise<{ events: EventReport; messages: DispatchReport }> {
  const deadline = Date.now() + budgetMs;
  const platform = await ensurePlatformConnection(config);
  const events = await processNotificationEvents(platform, deadline);
  const messages = await dispatchOutbox(config, deadline);
  return { events, messages };
}

// ---------------------------------------------------------------------------
// Low-stock scan
// ---------------------------------------------------------------------------

export async function scanLowStock(config: WhatsAppConfig, budgetMs: number, now = new Date()): Promise<ScanReport> {
  const deadline = Date.now() + budgetMs;
  const platform = await ensurePlatformConnection(config);
  const definition = NOTIFICATION_EVENTS['inventory.low_stock'];
  // Only farms where someone can actually receive an alert are worth reading.
  const organizationIds = await store.listOrganizationsWithConsentedContacts(definition.consentCategory);
  const windowStart = scanWindowStart(now);
  const report: ScanReport = { organizations: organizationIds.length, scanned: 0, events: 0, deferred: 0, errors: 0 };

  for (const [index, organizationId] of organizationIds.entries()) {
    if (Date.now() >= deadline) {
      report.deferred = organizationIds.length - index;
      break;
    }
    try {
      const context = await store.getOrganizationContext(organizationId);
      if (!context?.features.whatsapp_notifications) continue;

      const tenant = store.forTenant(organizationId);
      const rule = await tenant.getRule(definition.type, CHANNEL);
      if (rule && !rule.enabled) continue;
      // Without an approved template nothing could be sent, so leave episodes untouched until one exists.
      const sender = await resolveSender(tenant, platform);
      if (!(await tenant.findApprovedTemplate(sender, definition.templateKey))) continue;

      const lowItems = findLowStockItems(await getTenantDirectory(context).listInventoryLevels());
      const diff = diffLowStockEpisodes(lowItems, await tenant.listActiveAlertStates(LOW_STOCK_ALERT_PREFIX));

      if (diff.started.length) {
        const created = await notify({
          organizationId,
          eventType: definition.type,
          payload: { items: diff.started, belowMinimumCount: lowItems.length },
          idempotencyKey: lowStockEventKey(diff.started, windowStart),
          source: { type: 'inventory_scan', id: windowStart.toISOString() },
        });
        if (created) report.events += 1;
      }

      await tenant.saveActiveAlertStates([
        ...diff.started.map(item => ({ alertKey: lowStockAlertKey(item.itemId), episodeStartedAt: now.toISOString(), details: { name: item.name } })),
        ...diff.continuing.map(({ item, episodeStartedAt }) => ({ alertKey: lowStockAlertKey(item.itemId), episodeStartedAt, details: { name: item.name } })),
      ], now);
      await tenant.resolveAlertStates(diff.resolvedKeys, now);
      report.scanned += 1;
    } catch (error) {
      report.errors += 1;
      console.error('[comms] Low-stock scan failed for organization', organizationId, error);
    }
  }
  return report;
}
