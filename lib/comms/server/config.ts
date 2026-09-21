import 'server-only';

import { timingSafeEqual } from 'node:crypto';

import { normalizePhoneNumber } from '@/lib/comms/phone';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  displayPhoneNumber: string;
  appSecret: string;
  webhookVerifyToken: string;
  graphApiVersion: string;
  /** Overridable so a staging or test run can point at a stub instead of Meta. */
  graphBaseUrl: string;
}

export const COMMS_LIMITS = {
  // Protects the shared platform number's quality rating from any single tenant.
  dailyMessagesPerOrganization: 200,
  linkCodeTtlMinutes: 30,
  linkCodesPerHour: 5,
  maxMessageAttempts: 5,
  // Event failures are usually a backend outage, so they retry for about an hour.
  maxEventAttempts: 8,
  batchSize: 25,
  leaseSeconds: 120,
} as const;

export const PLATFORM_SECRET_REF = 'env:WHATSAPP_ACCESS_TOKEN';
export const PLATFORM_DISPLAY_NAME = 'StockIntel Agri';

// Only these variables may be referenced by a connection's secret_ref, so a
// tampered row cannot point the sender at another credential.
const ALLOWED_ENV_SECRETS = new Set(['WHATSAPP_ACCESS_TOKEN']);

function env(name: string): string {
  return process.env[name]?.trim() ?? '';
}

export function getWhatsAppConfig(): WhatsAppConfig | null {
  const displayPhoneNumber = normalizePhoneNumber(env('WHATSAPP_DISPLAY_PHONE_NUMBER'));
  const config = {
    accessToken: env('WHATSAPP_ACCESS_TOKEN'),
    phoneNumberId: env('WHATSAPP_PHONE_NUMBER_ID'),
    businessAccountId: env('WHATSAPP_BUSINESS_ACCOUNT_ID'),
    displayPhoneNumber: displayPhoneNumber ?? '',
    appSecret: env('WHATSAPP_APP_SECRET'),
    webhookVerifyToken: env('WHATSAPP_WEBHOOK_VERIFY_TOKEN'),
    graphApiVersion: env('WHATSAPP_GRAPH_API_VERSION') || 'v23.0',
    graphBaseUrl: (env('WHATSAPP_GRAPH_BASE_URL') || 'https://graph.facebook.com').replace(/\/+$/, ''),
  };
  return Object.values(config).every(Boolean) ? config : null;
}

/** Messaging needs both a WhatsApp sender and the Supabase store its queue lives in. */
export function isCommsStoreConfigured(): boolean {
  return isSupabaseConfigured() && Boolean(env('SUPABASE_SECRET_KEY'));
}

export function getQuotaMode(): 'observe' | 'enforce' {
  return env('COMMS_QUOTA_MODE').toLowerCase() === 'enforce' ? 'enforce' : 'observe';
}

export function resolveConnectionSecret(secretRef: string): string | null {
  const [scheme, name] = secretRef.split(':', 2);
  if (scheme === 'env' && name && ALLOWED_ENV_SECRETS.has(name)) return env(name) || null;
  // Tenant-owned numbers will store their tokens in Supabase Vault.
  return null;
}

export function safeEqual(received: string, expected: string): boolean {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Vercel Cron and other schedulers send `Authorization: Bearer <CRON_SECRET>`. */
export function isAuthorizedCronRequest(authorization: string | null): boolean {
  const secret = env('CRON_SECRET');
  if (!secret || !authorization?.startsWith('Bearer ')) return false;
  return safeEqual(authorization.slice(7), secret);
}
