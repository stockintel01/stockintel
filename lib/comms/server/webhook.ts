import 'server-only';

import {
  hashLinkCode,
  helpReplyText,
  linkReplyText,
  parseInboundCommand,
  startReplyText,
  stopReplyText,
} from '@/lib/comms/inbound';
import type { MetaInboundMessage, MetaWebhookChange } from '@/lib/comms/meta';
import { fromWhatsAppId, toWhatsAppRecipient } from '@/lib/comms/phone';
import { resolveConnectionSecret, type WhatsAppConfig } from '@/lib/comms/server/config';
import { createMetaCloudProvider } from '@/lib/comms/server/provider';
import * as store from '@/lib/comms/server/repository';
import { dispatchOutbox, ensurePlatformConnection } from '@/lib/comms/server/worker';

export interface WebhookResult {
  statuses: number;
  messages: number;
  ignored: number;
}

/** Replies and dispatches to run once Meta has its response. */
export type FollowUps = Array<() => Promise<void>>;

const REPLY_DISPATCH_BUDGET_MS = 10_000;

function replyDirectly(config: WhatsAppConfig, connection: store.ChannelConnection, address: string, body: string) {
  return async () => {
    const accessToken = resolveConnectionSecret(connection.secret_ref);
    if (!accessToken) return;
    const provider = createMetaCloudProvider({
      accessToken,
      phoneNumberId: connection.provider_sender_id,
      graphApiVersion: config.graphApiVersion,
      graphBaseUrl: config.graphBaseUrl,
    });
    const result = await provider.sendText({ to: toWhatsAppRecipient(address), body });
    if (!result.ok) console.error('[comms] Keyword reply failed', result.code, result.message);
  };
}

async function handleInboundMessage(
  config: WhatsAppConfig,
  connection: store.ChannelConnection,
  message: MetaInboundMessage,
  followUps: FollowUps,
): Promise<void> {
  const address = fromWhatsAppId(message.from);
  if (!address) return;
  const command = parseInboundCommand(message.text);

  switch (command.kind) {
    case 'link': {
      const result = await store.linkContactChannel({
        codeHash: hashLinkCode(command.code),
        address,
        connectionId: connection.id,
        providerMessageId: message.providerMessageId,
        receivedAt: message.timestamp,
      });
      const reply = linkReplyText(result.outcome, result.organizationName);
      if (!reply) return;

      if (result.outcome === 'linked' && result.organizationId && result.contactChannelId) {
        // A confirmation to a newly consented contact goes through the outbox so it is audited like any message.
        await store.forTenant(result.organizationId).enqueueMessage({
          eventId: null,
          connectionId: connection.id,
          contactChannelId: result.contactChannelId,
          templateId: null,
          kind: 'text',
          recipientAddress: address,
          content: { text: reply },
          idempotencyKey: `inbound:${message.providerMessageId}:reply`,
        });
        followUps.push(async () => {
          await dispatchOutbox(config, Date.now() + REPLY_DISPATCH_BUDGET_MS, 5);
        });
        return;
      }
      followUps.push(replyDirectly(config, connection, address, reply));
      return;
    }
    case 'stop':
    case 'start': {
      const result = await store.setKeywordConsent({
        connectionId: connection.id,
        address,
        granted: command.kind === 'start',
        providerMessageId: message.providerMessageId,
        receivedAt: message.timestamp,
      });
      const reply = command.kind === 'stop' ? stopReplyText(result.organizationNames) : startReplyText(result.organizationNames);
      followUps.push(replyDirectly(config, connection, address, reply));
      return;
    }
    case 'help':
      followUps.push(replyDirectly(config, connection, address, helpReplyText()));
      return;
    case 'none':
      return;
  }
}

/**
 * Follow-ups are pushed onto the caller's list as each message is handled, so replies
 * for messages that succeeded still go out if a later message in the batch throws.
 */
export async function handleWhatsAppWebhook(changes: MetaWebhookChange[], config: WhatsAppConfig, followUps: FollowUps): Promise<WebhookResult> {
  const result: WebhookResult = { statuses: 0, messages: 0, ignored: 0 };
  if (!changes.length) return result;

  // The first webhook can arrive before any scheduled run has registered the platform sender.
  await ensurePlatformConnection(config);

  for (const change of changes) {
    // The tenant comes only from our own record of which account owns this number, never from the payload.
    const connection = await store.findConnectionBySender('whatsapp', change.phoneNumberId);
    if (!connection || connection.provider_account_id !== change.accountId) {
      result.ignored += change.messages.length + change.statuses.length;
      continue;
    }

    for (const status of change.statuses) {
      await store.recordDeliveryStatus(status);
      result.statuses += 1;
    }

    for (const message of change.messages) {
      if (!(await store.recordInboundReceipt(message.providerMessageId, connection.id))) continue;
      try {
        await handleInboundMessage(config, connection, message, followUps);
        result.messages += 1;
      } catch (error) {
        // Forget the receipt so Meta's retry of this webhook can process the message again.
        await store.deleteInboundReceipt(message.providerMessageId)
          .catch(deleteError => console.error('[comms] Could not release inbound receipt', message.providerMessageId, deleteError));
        throw error;
      }
    }
  }
  return result;
}
