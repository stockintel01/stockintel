import 'server-only';

import {
  activatePaystackCheckout,
  getPaystackCheckout,
  getPaystackSubscriptionContext,
  getPaystackSubscriptionContextByCustomerPlan,
  linkPaystackSubscription,
  reversePaystackCheckout,
  updatePaystackSubscriptionStatus,
} from './paystack-repository';
import { validatePaystackPayment, type PaystackPaymentData } from '@/lib/payments/paystack-validation';

type Row = Record<string, unknown>;

function row(value: unknown): Row {
  return value && typeof value === 'object' ? value as Row : {};
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value);
}

function date(value: unknown): Date | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function subscriptionCode(data: Row): string {
  const subscription = data.subscription;
  if (typeof subscription === 'string') return subscription;
  const subscriptionRow = row(subscription);
  return text(subscriptionRow.subscription_code ?? subscriptionRow.subscriptionCode ?? data.subscription_code);
}

function planCode(data: Row): string {
  const plan = data.plan;
  if (typeof plan === 'string') return plan;
  const planRow = row(plan);
  return text(planRow.plan_code ?? planRow.planCode ?? data.plan_code);
}

function customer(data: Row) {
  const customerRow = row(data.customer);
  return {
    email: text(customerRow.email ?? data.customer_email).toLowerCase(),
    code: text(customerRow.customer_code ?? customerRow.customerCode ?? data.customer_code),
  };
}

function emailToken(data: Row) {
  return text(data.email_token ?? row(data.subscription).email_token);
}

function period(data: Row) {
  return {
    start: date(data.period_start ?? data.paid_at ?? data.createdAt),
    end: date(data.period_end ?? data.next_payment_date ?? row(data.subscription).next_payment_date),
  };
}

export async function processVerifiedPaystackPayment(data: Row) {
  const reference = text(data.reference);
  if (!reference) throw new Error('Paystack transaction reference is missing.');
  const checkout = await getPaystackCheckout(reference);
  if (!checkout) throw new Error('This Paystack transaction was not initialized by StockIntel.');
  const verified = validatePaystackPayment({
    reference: checkout.reference,
    amountMinor: checkout.amountMinor,
    currency: checkout.currency,
    planCode: checkout.planCode,
  }, data as PaystackPaymentData);
  return activatePaystackCheckout({
    ...checkout,
    transactionId: verified.transactionId,
    customerCode: verified.customerCode,
    subscriptionCode: verified.subscriptionCode || subscriptionCode(data) || null,
    emailToken: verified.emailToken || emailToken(data) || null,
    paidAt: verified.paidAt,
    nextPaymentAt: date(data.next_payment_date),
  });
}

async function processCharge(data: Row) {
  const reference = text(data.reference);
  if (!reference) throw new Error('Paystack charge has no reference.');
  const checkout = await getPaystackCheckout(reference);
  if (checkout) return processVerifiedPaystackPayment(data);

  const code = subscriptionCode(data);
  const buyer = customer(data);
  const recurringPlanCode = planCode(data);
  const context = code
    ? await getPaystackSubscriptionContext(code)
    : await getPaystackSubscriptionContextByCustomerPlan(buyer.code, recurringPlanCode);
  if (!context) return;
  validatePaystackPayment({
    reference,
    amountMinor: context.amountMinor,
    currency: context.currency,
    planCode: context.planCode,
  }, data as PaystackPaymentData);
  const paidAt = date(data.paid_at) ?? new Date();
  const resolvedCode = code || context.subscriptionCode;
  if (!resolvedCode) return;
  await updatePaystackSubscriptionStatus({
    subscriptionCode: resolvedCode,
    status: 'active',
    periodStart: paidAt,
    periodEnd: date(data.next_payment_date) ?? new Date(paidAt.getTime() + 31 * 86_400_000),
    cancelAtPeriodEnd: false,
  });
}

async function processSubscriptionCreated(data: Row) {
  const code = subscriptionCode(data) || text(data.subscription_code);
  const token = emailToken(data);
  const plan = planCode(data);
  const buyer = customer(data);
  if (!code || !token || !plan || !buyer.email) throw new Error('Paystack subscription event is missing required identifiers.');
  await linkPaystackSubscription({
    customerEmail: buyer.email,
    customerCode: buyer.code,
    planCode: plan,
    subscriptionCode: code,
    emailToken: token,
    nextPaymentAt: date(data.next_payment_date),
  });
}

async function processInvoice(data: Row, failed: boolean) {
  const subscription = row(data.subscription);
  const code = subscriptionCode(data) || text(subscription.subscription_code);
  if (!code) throw new Error('Paystack invoice has no subscription code.');
  const dates = period(data);
  const paid = data.paid === true || text(data.status).toLowerCase() === 'success';
  await updatePaystackSubscriptionStatus({
    subscriptionCode: code,
    status: failed || !paid ? 'past_due' : 'active',
    periodStart: dates.start,
    periodEnd: dates.end,
    cancelAtPeriodEnd: false,
  });
}

async function processRefund(data: Row) {
  const transaction = row(data.transaction);
  const reference = text(transaction.reference ?? data.transaction_reference ?? data.reference);
  if (!reference) return;
  const checkout = await getPaystackCheckout(reference);
  if (!checkout) return;
  const refundedAmount = Number(data.amount ?? data.refund_amount);
  if (!Number.isSafeInteger(refundedAmount) || refundedAmount < checkout.amountMinor) return;
  await reversePaystackCheckout(reference, 'Paystack confirmed that the full payment was refunded.');
}

export async function processPaystackEvent(event: string, data: Row) {
  switch (event) {
    case 'charge.success':
      await processCharge(data);
      return;
    case 'subscription.create':
      await processSubscriptionCreated(data);
      return;
    case 'invoice.update':
      await processInvoice(data, false);
      return;
    case 'invoice.payment_failed':
      await processInvoice(data, true);
      return;
    case 'subscription.not_renew': {
      const code = subscriptionCode(data) || text(data.subscription_code);
      if (code) await updatePaystackSubscriptionStatus({ subscriptionCode: code, status: 'active', cancelAtPeriodEnd: true });
      return;
    }
    case 'subscription.disable': {
      const code = subscriptionCode(data) || text(data.subscription_code);
      const status = text(data.status).toLowerCase() === 'complete' ? 'expired' : 'cancelled';
      if (code) await updatePaystackSubscriptionStatus({ subscriptionCode: code, status, cancelAtPeriodEnd: false });
      return;
    }
    case 'refund.processed':
      await processRefund(data);
      return;
    default:
      // Other signed events (including disputes and pending refunds) remain in the
      // webhook ledger for operational review without changing customer access.
      return;
  }
}
