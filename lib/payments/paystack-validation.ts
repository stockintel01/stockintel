export const PAYSTACK_TERMS_VERSION = '2026-09-28';

export interface ExpectedPaystackPayment {
  reference: string;
  amountMinor: number;
  currency: string;
  planCode: string;
}

export interface PaystackPaymentData {
  reference?: unknown;
  amount?: unknown;
  currency?: unknown;
  status?: unknown;
  plan?: unknown;
  paid_at?: unknown;
  paidAt?: unknown;
  id?: unknown;
  customer?: unknown;
  subscription?: unknown;
}

function planCode(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    return String(row.plan_code ?? row.planCode ?? '').trim();
  }
  return '';
}

export function validatePaystackPayment(expected: ExpectedPaystackPayment, data: PaystackPaymentData) {
  if (String(data.status ?? '').toLowerCase() !== 'success') {
    throw new Error('Paystack has not confirmed this transaction as successful.');
  }
  if (String(data.reference ?? '') !== expected.reference) {
    throw new Error('Paystack returned a different transaction reference.');
  }
  const amount = Number(data.amount);
  if (!Number.isSafeInteger(amount) || amount !== expected.amountMinor) {
    throw new Error('Paystack returned an unexpected payment amount.');
  }
  if (String(data.currency ?? '').toUpperCase() !== expected.currency.toUpperCase()) {
    throw new Error('Paystack returned an unexpected payment currency.');
  }
  const actualPlan = planCode(data.plan);
  if (actualPlan && actualPlan !== expected.planCode) {
    throw new Error('Paystack returned an unexpected subscription plan.');
  }
  const transactionId = String(data.id ?? '').trim();
  if (!transactionId) throw new Error('Paystack did not return a transaction identifier.');

  const customer = data.customer && typeof data.customer === 'object'
    ? data.customer as Record<string, unknown>
    : {};
  const subscription = data.subscription && typeof data.subscription === 'object'
    ? data.subscription as Record<string, unknown>
    : {};
  const paidAtValue = data.paid_at ?? data.paidAt;
  const paidAt = paidAtValue ? new Date(String(paidAtValue)) : new Date();
  if (Number.isNaN(paidAt.getTime())) throw new Error('Paystack returned an invalid payment date.');

  return {
    transactionId,
    customerCode: String(customer.customer_code ?? customer.customerCode ?? '').trim() || null,
    subscriptionCode: String(subscription.subscription_code ?? subscription.subscriptionCode ?? '').trim() || null,
    emailToken: String(subscription.email_token ?? subscription.emailToken ?? '').trim() || null,
    paidAt,
  };
}
