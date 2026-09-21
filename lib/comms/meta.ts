import { createHmac, timingSafeEqual } from 'node:crypto';

export type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';
export type FailureKind = 'permanent' | 'transient' | 'rate_limited' | 'auth';

export interface MetaInboundMessage {
  providerMessageId: string;
  from: string;
  timestamp: Date;
  type: string;
  text: string | null;
}

export interface MetaStatusUpdate {
  providerMessageId: string;
  status: DeliveryStatus;
  timestamp: Date;
  errorCode: string | null;
  errorTitle: string | null;
  pricingCategory: string | null;
  billable: boolean | null;
}

export interface MetaWebhookChange {
  accountId: string;
  phoneNumberId: string;
  messages: MetaInboundMessage[];
  statuses: MetaStatusUpdate[];
}

export interface MetaError {
  code: string | null;
  title: string;
}

const DELIVERY_STATUSES = new Set<DeliveryStatus>(['sent', 'delivered', 'read', 'failed']);

// ---------------------------------------------------------------------------
// Webhook verification and parsing
// ---------------------------------------------------------------------------

/**
 * Meta signs the exact request bytes with the app secret. Verify before parsing,
 * and always against the raw bytes: re-serialized JSON will not match.
 */
export function verifyMetaSignature(rawBody: Uint8Array, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader || !appSecret) return false;
  const match = /^sha256=([0-9a-f]{64})$/i.exec(signatureHeader.trim());
  if (!match) return false;

  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  const received = Buffer.from(match[1], 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function epochSeconds(value: unknown): Date | null {
  const seconds = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null;
}

function inboundText(message: Record<string, unknown>): string | null {
  const type = text(message.type);
  if (type === 'text') return text(record(message.text)?.body);
  if (type === 'button') return text(record(message.button)?.text);
  if (type === 'interactive') {
    const interactive = record(message.interactive);
    return text(record(interactive?.button_reply)?.title) ?? text(record(interactive?.list_reply)?.title);
  }
  return null;
}

/** Extracts message and status events from a WhatsApp Business Account webhook. Malformed items are skipped. */
export function parseMetaWebhook(payload: unknown): MetaWebhookChange[] {
  const root = record(payload);
  if (!root || root.object !== 'whatsapp_business_account') return [];

  const changes: MetaWebhookChange[] = [];
  for (const entryValue of list(root.entry)) {
    const entry = record(entryValue);
    const accountId = text(entry?.id);
    if (!entry || !accountId) continue;

    for (const changeValue of list(entry.changes)) {
      const change = record(changeValue);
      if (change?.field !== 'messages') continue;
      const value = record(change.value);
      const phoneNumberId = text(record(value?.metadata)?.phone_number_id);
      if (!value || !phoneNumberId) continue;

      const messages: MetaInboundMessage[] = [];
      for (const messageValue of list(value.messages)) {
        const message = record(messageValue);
        const providerMessageId = text(message?.id);
        const from = text(message?.from);
        const timestamp = epochSeconds(message?.timestamp);
        if (!message || !providerMessageId || !from || !timestamp) continue;
        messages.push({
          providerMessageId,
          from,
          timestamp,
          type: text(message.type) ?? 'unknown',
          text: inboundText(message),
        });
      }

      const statuses: MetaStatusUpdate[] = [];
      for (const statusValue of list(value.statuses)) {
        const status = record(statusValue);
        const providerMessageId = text(status?.id);
        const state = text(status?.status);
        const timestamp = epochSeconds(status?.timestamp);
        if (!status || !providerMessageId || !state || !DELIVERY_STATUSES.has(state as DeliveryStatus) || !timestamp) continue;
        const error = record(list(status.errors)[0]);
        const pricing = record(status.pricing);
        statuses.push({
          providerMessageId,
          status: state as DeliveryStatus,
          timestamp,
          errorCode: error?.code === undefined || error?.code === null ? null : String(error.code),
          errorTitle: text(error?.title) ?? text(error?.message),
          pricingCategory: text(pricing?.category),
          billable: typeof pricing?.billable === 'boolean' ? pricing.billable : null,
        });
      }

      if (messages.length || statuses.length) changes.push({ accountId, phoneNumberId, messages, statuses });
    }
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Outbound payloads
// ---------------------------------------------------------------------------

/**
 * Template parameters may not contain newlines, tabs, or runs of more than four
 * spaces, and may not be empty. Anything else is rejected by Meta at send time.
 */
export function sanitizeTemplateParameter(value: string, maxLength = 700): string {
  const collapsed = value.replace(/\s+/g, ' ').trim();
  if (!collapsed) return '-';
  if (collapsed.length <= maxLength) return collapsed;
  return `${collapsed.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

export function buildTemplateMessage(input: {
  to: string;
  templateName: string;
  languageCode: string;
  bodyParameters: string[];
}): Record<string, unknown> {
  const components = input.bodyParameters.length
    ? [{
      type: 'body',
      parameters: input.bodyParameters.map(parameter => ({ type: 'text', text: sanitizeTemplateParameter(parameter) })),
    }]
    : [];
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: input.to,
    type: 'template',
    template: {
      name: input.templateName,
      language: { code: input.languageCode },
      components,
    },
  };
}

export function buildTextMessage(input: { to: string; body: string }): Record<string, unknown> {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: input.to,
    type: 'text',
    text: { preview_url: false, body: input.body.slice(0, 4096) },
  };
}

export function extractSentMessageId(body: unknown): string | null {
  return text(record(list(record(body)?.messages)[0])?.id);
}

export function parseMetaError(body: unknown): MetaError {
  const error = record(record(body)?.error);
  const details = text(record(error?.error_data)?.details);
  return {
    code: error?.code === undefined || error?.code === null ? null : String(error.code),
    title: (details ?? text(error?.message) ?? 'WhatsApp request failed').slice(0, 500),
  };
}

// ---------------------------------------------------------------------------
// Failure handling
// ---------------------------------------------------------------------------

const RATE_LIMIT_CODES = new Set(['4', '17', '32', '613', '80007', '130429', '131048', '131056']);
const TRANSIENT_CODES = new Set(['1', '2', '131000', '131016']);
const AUTH_CODES = new Set(['0', '3', '10', '190', '131031']);

export function classifyMetaFailure(httpStatus: number | null, code: string | null): FailureKind {
  if (code && RATE_LIMIT_CODES.has(code)) return 'rate_limited';
  if (code && TRANSIENT_CODES.has(code)) return 'transient';
  if (code && (AUTH_CODES.has(code) || /^2\d\d$/.test(code))) return 'auth';
  if (httpStatus === 429) return 'rate_limited';
  if (httpStatus === 401 || httpStatus === 403) return 'auth';
  if (httpStatus === null || httpStatus >= 500) return 'transient';
  return 'permanent';
}

/** Exponential backoff with ±20% jitter: transient failures from 30 seconds, rate limits from one minute. */
export function retryDelaySeconds(attempt: number, kind: 'transient' | 'rate_limited', random: () => number = Math.random): number {
  const base = kind === 'rate_limited' ? 60 : 30;
  const cap = kind === 'rate_limited' ? 3600 : 1800;
  const delay = Math.min(cap, base * 2 ** Math.max(0, attempt - 1));
  const jitter = 0.8 + random() * 0.4;
  return Math.max(1, Math.round(delay * jitter));
}
