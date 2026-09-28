import 'server-only';

import { verifyPaystackHmac } from './paystack-signature';

const PAYSTACK_API = 'https://api.paystack.co';

interface PaystackEnvelope<T> {
  status: boolean;
  message: string;
  data: T;
}

function secretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!key) throw new Error('PAYSTACK_SECRET_KEY is not configured.');
  return key;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${PAYSTACK_API}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => null) as PaystackEnvelope<T> | null;
  if (!response.ok || !payload?.status) {
    throw new Error(payload?.message || `Paystack request failed with HTTP ${response.status}.`);
  }
  return payload.data;
}

export interface PaystackPlan {
  name: string;
  amount: number;
  interval: string;
  plan_code: string;
  currency: string;
}

export function fetchPaystackPlan(planCode: string) {
  return request<PaystackPlan>(`/plan/${encodeURIComponent(planCode)}`);
}

export interface InitializePaystackInput {
  email: string;
  amountMinor: number;
  currency: string;
  reference: string;
  planCode: string;
  callbackUrl: string;
  cancelUrl: string;
  metadata: Record<string, unknown>;
}

export function initializePaystackTransaction(input: InitializePaystackInput) {
  return request<{ authorization_url: string; access_code: string; reference: string }>('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      amount: String(input.amountMinor),
      currency: input.currency,
      reference: input.reference,
      plan: input.planCode,
      callback_url: input.callbackUrl,
      metadata: JSON.stringify({ ...input.metadata, cancel_action: input.cancelUrl }),
    }),
  });
}

export function verifyPaystackTransaction(reference: string) {
  return request<Record<string, unknown>>(`/transaction/verify/${encodeURIComponent(reference)}`);
}

export function generatePaystackSubscriptionManageLink(subscriptionCode: string) {
  return request<{ link: string }>(`/subscription/${encodeURIComponent(subscriptionCode)}/manage/link`);
}

export function updatePaystackPlan(input: { planCode: string; amountMinor: number; name: string }) {
  return request<unknown>(`/plan/${encodeURIComponent(input.planCode)}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: input.name,
      amount: input.amountMinor,
      interval: 'monthly',
      currency: 'GHS',
      update_existing_subscriptions: false,
    }),
  });
}

export function paystackPlanCode(plan: 'pro' | 'enterprise') {
  const value = plan === 'pro' ? process.env.PAYSTACK_PLAN_CODE_PRO : process.env.PAYSTACK_PLAN_CODE_ENTERPRISE;
  return value?.trim() || null;
}

export function verifyPaystackSignature(rawBody: string, signature: string | null): boolean {
  return verifyPaystackHmac(rawBody, signature, secretKey());
}
