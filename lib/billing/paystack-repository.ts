import 'server-only';

import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { adminDb } from '@/lib/firebase-admin';
import { isSupabaseBackendActive } from '@/lib/supabase/config';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import type { PaidPlan, StoredSubscriptionStatus } from './subscription-repository';

export interface PaystackCheckoutRecord {
  reference: string;
  organizationId: string;
  userId: string;
  plan: PaidPlan;
  planCode: string;
  customerEmail: string;
  amountMinor: number;
  currency: string;
  termsVersion: string;
  termsAcceptedAt: Date;
  status: 'initialized' | 'succeeded' | 'failed' | 'reversed';
  providerTransactionId?: string | null;
  providerSubscriptionCode?: string | null;
}

interface PaystackActivation extends PaystackCheckoutRecord {
  transactionId: string;
  customerCode: string | null;
  subscriptionCode: string | null;
  emailToken: string | null;
  paidAt: Date;
  nextPaymentAt?: Date | null;
}

function assertSuccessful(error: { message?: string } | null, operation: string) {
  if (error) throw new Error(`${operation}: ${error.message ?? 'database operation failed'}`);
}

function linkId(email: string, planCode: string) {
  return createHash('sha256').update(`${email.trim().toLowerCase()}|${planCode}`).digest('hex');
}

function fromFirestore(reference: string, data: Record<string, unknown>): PaystackCheckoutRecord {
  const accepted = data.termsAcceptedAt as { toDate?: () => Date } | string | undefined;
  return {
    reference,
    organizationId: String(data.organizationId ?? ''),
    userId: String(data.userId ?? ''),
    plan: data.plan === 'enterprise' ? 'enterprise' : 'pro',
    planCode: String(data.planCode ?? ''),
    customerEmail: String(data.customerEmail ?? ''),
    amountMinor: Number(data.amountMinor ?? 0),
    currency: String(data.currency ?? ''),
    termsVersion: String(data.termsVersion ?? ''),
    termsAcceptedAt: typeof accepted === 'object' && accepted?.toDate
      ? accepted.toDate()
      : new Date(String(accepted ?? 0)),
    status: String(data.status ?? 'initialized') as PaystackCheckoutRecord['status'],
    providerTransactionId: data.providerTransactionId ? String(data.providerTransactionId) : null,
    providerSubscriptionCode: data.providerSubscriptionCode ? String(data.providerSubscriptionCode) : null,
  };
}

export async function createPaystackCheckout(record: Omit<PaystackCheckoutRecord, 'status'>): Promise<void> {
  if (isSupabaseBackendActive()) {
    const { error } = await getSupabaseAdminClient().from('paystack_checkout_transactions').insert({
      reference: record.reference,
      organization_id: record.organizationId,
      user_id: record.userId,
      plan_id: record.plan,
      plan_code: record.planCode,
      customer_email: record.customerEmail,
      amount_minor: record.amountMinor,
      currency: record.currency,
      terms_version: record.termsVersion,
      terms_accepted_at: record.termsAcceptedAt.toISOString(),
    });
    assertSuccessful(error, 'Unable to record the Paystack checkout');
    return;
  }

  const checkoutRef = adminDb.collection('billing_paystack_transactions').doc(record.reference);
  const lookupRef = adminDb.collection('billing_paystack_checkout_links').doc(linkId(record.customerEmail, record.planCode));
  const batch = adminDb.batch();
  batch.create(checkoutRef, {
    ...record,
    status: 'initialized',
    termsAcceptedAt: Timestamp.fromDate(record.termsAcceptedAt),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(lookupRef, {
    reference: record.reference,
    organizationId: record.organizationId,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
}

export async function getPaystackCheckout(reference: string): Promise<PaystackCheckoutRecord | null> {
  if (isSupabaseBackendActive()) {
    const { data, error } = await getSupabaseAdminClient().from('paystack_checkout_transactions')
      .select('reference, organization_id, user_id, plan_id, plan_code, customer_email, amount_minor, currency, terms_version, terms_accepted_at, status, provider_transaction_id, provider_subscription_code')
      .eq('reference', reference)
      .maybeSingle();
    assertSuccessful(error, 'Unable to load the Paystack checkout');
    if (!data) return null;
    return {
      reference: String(data.reference),
      organizationId: String(data.organization_id),
      userId: String(data.user_id ?? ''),
      plan: data.plan_id === 'enterprise' ? 'enterprise' : 'pro',
      planCode: String(data.plan_code),
      customerEmail: String(data.customer_email),
      amountMinor: Number(data.amount_minor),
      currency: String(data.currency),
      termsVersion: String(data.terms_version),
      termsAcceptedAt: new Date(String(data.terms_accepted_at)),
      status: String(data.status) as PaystackCheckoutRecord['status'],
      providerTransactionId: data.provider_transaction_id ? String(data.provider_transaction_id) : null,
      providerSubscriptionCode: data.provider_subscription_code ? String(data.provider_subscription_code) : null,
    };
  }
  const snapshot = await adminDb.collection('billing_paystack_transactions').doc(reference).get();
  return snapshot.exists ? fromFirestore(snapshot.id, snapshot.data() ?? {}) : null;
}

export async function markPaystackCheckoutFailed(reference: string, reason: string): Promise<void> {
  if (isSupabaseBackendActive()) {
    const { error } = await getSupabaseAdminClient().from('paystack_checkout_transactions').update({
      status: 'failed', failure_reason: reason.slice(0, 1000), updated_at: new Date().toISOString(),
    }).eq('reference', reference).neq('status', 'succeeded');
    assertSuccessful(error, 'Unable to record the failed Paystack checkout');
    return;
  }
  await adminDb.collection('billing_paystack_transactions').doc(reference).set({
    status: 'failed', failureReason: reason.slice(0, 1000), updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function activatePaystackCheckout(input: PaystackActivation): Promise<{ organizationId: string; duplicate: boolean }> {
  if (isSupabaseBackendActive()) {
    const { data, error } = await getSupabaseAdminClient().rpc('activate_paystack_checkout', {
      p_reference: input.reference,
      p_transaction_id: input.transactionId,
      p_amount_minor: input.amountMinor,
      p_currency: input.currency,
      p_customer_code: input.customerCode,
      p_subscription_code: input.subscriptionCode,
      p_email_token: input.emailToken,
      p_paid_at: input.paidAt.toISOString(),
      p_next_payment_at: input.nextPaymentAt?.toISOString() ?? null,
    });
    assertSuccessful(error, 'Unable to activate the Paystack checkout');
    const result = data as { organization_id?: string; duplicate?: boolean } | null;
    return { organizationId: String(result?.organization_id ?? input.organizationId), duplicate: Boolean(result?.duplicate) };
  }

  const checkoutRef = adminDb.collection('billing_paystack_transactions').doc(input.reference);
  const organizationRef = adminDb.collection('organizations').doc(input.organizationId);
  const secretRef = adminDb.collection('billing_paystack_subscriptions').doc(input.organizationId);
  return adminDb.runTransaction(async transaction => {
    const current = await transaction.get(checkoutRef);
    if (!current.exists) throw new Error('Unknown Paystack transaction reference.');
    const row = fromFirestore(current.id, current.data() ?? {});
    if (row.organizationId !== input.organizationId || row.amountMinor !== input.amountMinor || row.currency !== input.currency) {
      throw new Error('Paystack payment does not match the recorded checkout.');
    }
    if (row.status === 'succeeded') {
      if (row.providerTransactionId !== input.transactionId) throw new Error('Checkout was already fulfilled by another transaction.');
      return { organizationId: row.organizationId, duplicate: true };
    }
    if (row.status === 'reversed') throw new Error('This payment was refunded and cannot reactivate the subscription.');
    const periodEnd = input.nextPaymentAt ?? new Date(input.paidAt.getTime() + 31 * 86_400_000);
    transaction.update(checkoutRef, {
      status: 'succeeded', providerTransactionId: input.transactionId,
      providerCustomerCode: input.customerCode, providerSubscriptionCode: input.subscriptionCode,
      paidAt: Timestamp.fromDate(input.paidAt), failureReason: null, updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(organizationRef, {
      'subscription.plan': input.plan,
      'subscription.status': 'active',
      'subscription.provider': 'paystack',
      'subscription.paystackCustomerCode': input.customerCode,
      'subscription.paystackSubscriptionCode': input.subscriptionCode,
      'subscription.currentPeriodStart': Timestamp.fromDate(input.paidAt),
      'subscription.currentPeriodEnd': Timestamp.fromDate(periodEnd),
      'subscription.cancelAtPeriodEnd': false,
    });
    if (input.subscriptionCode && input.emailToken) {
      transaction.set(secretRef, {
        organizationId: input.organizationId, subscriptionCode: input.subscriptionCode,
        emailToken: input.emailToken, customerCode: input.customerCode, plan: input.plan,
        planCode: input.planCode, amountMinor: input.amountMinor, currency: input.currency,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return { organizationId: row.organizationId, duplicate: false };
  });
}

export async function linkPaystackSubscription(input: {
  customerEmail: string; customerCode: string; planCode: string; subscriptionCode: string;
  emailToken: string; nextPaymentAt?: Date | null;
}): Promise<string> {
  if (isSupabaseBackendActive()) {
    const { data, error } = await getSupabaseAdminClient().rpc('link_paystack_subscription', {
      p_customer_email: input.customerEmail,
      p_customer_code: input.customerCode,
      p_plan_code: input.planCode,
      p_subscription_code: input.subscriptionCode,
      p_email_token: input.emailToken,
      p_next_payment_at: input.nextPaymentAt?.toISOString() ?? null,
    });
    assertSuccessful(error, 'Unable to link the Paystack subscription');
    return String(data);
  }
  const lookup = await adminDb.collection('billing_paystack_checkout_links').doc(linkId(input.customerEmail, input.planCode)).get();
  const reference = String(lookup.data()?.reference ?? '');
  if (!reference) throw new Error('No matching checkout exists for this Paystack subscription.');
  const checkout = await getPaystackCheckout(reference);
  if (!checkout) throw new Error('The matching Paystack checkout no longer exists.');
  const batch = adminDb.batch();
  batch.set(adminDb.collection('billing_paystack_subscriptions').doc(checkout.organizationId), {
    organizationId: checkout.organizationId, subscriptionCode: input.subscriptionCode,
    emailToken: input.emailToken, customerCode: input.customerCode, plan: checkout.plan,
    planCode: input.planCode, amountMinor: checkout.amountMinor, currency: checkout.currency,
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(adminDb.collection('billing_paystack_transactions').doc(reference), {
    providerCustomerCode: input.customerCode, providerSubscriptionCode: input.subscriptionCode,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.set(adminDb.collection('organizations').doc(checkout.organizationId), {
    'subscription.provider': 'paystack',
    'subscription.paystackCustomerCode': input.customerCode,
    'subscription.paystackSubscriptionCode': input.subscriptionCode,
    ...(input.nextPaymentAt ? { 'subscription.currentPeriodEnd': Timestamp.fromDate(input.nextPaymentAt) } : {}),
  }, { merge: true });
  await batch.commit();
  return checkout.organizationId;
}

export async function getPaystackSubscriptionSecret(organizationId: string): Promise<{ subscriptionCode: string; emailToken: string } | null> {
  if (isSupabaseBackendActive()) {
    const { data, error } = await getSupabaseAdminClient().from('paystack_subscription_secrets')
      .select('subscription_code, email_token').eq('organization_id', organizationId).maybeSingle();
    assertSuccessful(error, 'Unable to load the Paystack subscription');
    return data ? { subscriptionCode: String(data.subscription_code), emailToken: String(data.email_token) } : null;
  }
  const snapshot = await adminDb.collection('billing_paystack_subscriptions').doc(organizationId).get();
  return snapshot.exists ? {
    subscriptionCode: String(snapshot.data()?.subscriptionCode ?? ''),
    emailToken: String(snapshot.data()?.emailToken ?? ''),
  } : null;
}

export async function getPaystackSubscriptionContext(subscriptionCode: string): Promise<{
  organizationId: string; subscriptionCode: string; plan: PaidPlan; planCode: string; amountMinor: number; currency: string;
} | null> {
  if (isSupabaseBackendActive()) {
    const { data, error } = await getSupabaseAdminClient().from('paystack_subscription_secrets')
      .select('organization_id, plan_id, plan_code, amount_minor, currency')
      .eq('subscription_code', subscriptionCode).maybeSingle();
    assertSuccessful(error, 'Unable to load the Paystack subscription context');
    return data ? {
      organizationId: String(data.organization_id),
      subscriptionCode,
      plan: data.plan_id === 'enterprise' ? 'enterprise' : 'pro',
      planCode: String(data.plan_code), amountMinor: Number(data.amount_minor), currency: String(data.currency),
    } : null;
  }
  const snapshot = await adminDb.collection('billing_paystack_subscriptions')
    .where('subscriptionCode', '==', subscriptionCode).limit(1).get();
  if (snapshot.empty) return null;
  const data = snapshot.docs[0].data();
  return {
    organizationId: String(data.organizationId ?? snapshot.docs[0].id),
    subscriptionCode,
    plan: data.plan === 'enterprise' ? 'enterprise' : 'pro',
    planCode: String(data.planCode ?? ''), amountMinor: Number(data.amountMinor ?? 0), currency: String(data.currency ?? ''),
  };
}

export async function getPaystackSubscriptionContextByCustomerPlan(
  customerCode: string,
  planCode: string,
): Promise<{
  organizationId: string; subscriptionCode: string; plan: PaidPlan; planCode: string; amountMinor: number; currency: string;
} | null> {
  if (!customerCode || !planCode) return null;
  if (isSupabaseBackendActive()) {
    const { data, error } = await getSupabaseAdminClient().from('paystack_subscription_secrets')
      .select('organization_id, subscription_code, plan_id, plan_code, amount_minor, currency')
      .eq('customer_code', customerCode)
      .eq('plan_code', planCode)
      .maybeSingle();
    assertSuccessful(error, 'Unable to match the Paystack recurring charge');
    return data ? {
      organizationId: String(data.organization_id),
      subscriptionCode: String(data.subscription_code),
      plan: data.plan_id === 'enterprise' ? 'enterprise' : 'pro',
      planCode: String(data.plan_code), amountMinor: Number(data.amount_minor), currency: String(data.currency),
    } : null;
  }
  const snapshot = await adminDb.collection('billing_paystack_subscriptions')
    .where('customerCode', '==', customerCode).limit(10).get();
  const match = snapshot.docs.find(document => String(document.data().planCode ?? '') === planCode);
  if (!match) return null;
  const data = match.data();
  return {
    organizationId: String(data.organizationId ?? match.id),
    subscriptionCode: String(data.subscriptionCode ?? ''),
    plan: data.plan === 'enterprise' ? 'enterprise' : 'pro',
    planCode: String(data.planCode ?? ''), amountMinor: Number(data.amountMinor ?? 0), currency: String(data.currency ?? ''),
  };
}

export async function reversePaystackCheckout(reference: string, reason: string): Promise<void> {
  const checkout = await getPaystackCheckout(reference);
  if (!checkout) return;
  if (isSupabaseBackendActive()) {
    const client = getSupabaseAdminClient();
    const subscriptionUpdate = client.from('organization_subscriptions').update({
      status: 'cancelled', cancel_at_period_end: false, updated_at: new Date().toISOString(),
    }).eq('organization_id', checkout.organizationId).eq('provider', 'paystack');
    if (checkout.providerSubscriptionCode) subscriptionUpdate.eq('provider_subscription_id', checkout.providerSubscriptionCode);
    else subscriptionUpdate.eq('plan_id', checkout.plan);
    const [transactionResult, subscriptionResult] = await Promise.all([
      client.from('paystack_checkout_transactions').update({
        status: 'reversed', failure_reason: reason.slice(0, 1000), updated_at: new Date().toISOString(),
      }).eq('reference', reference),
      subscriptionUpdate,
    ]);
    assertSuccessful(transactionResult.error, 'Unable to mark the Paystack transaction reversed');
    assertSuccessful(subscriptionResult.error, 'Unable to suspend the refunded Paystack subscription');
    return;
  }
  const organizationRef = adminDb.collection('organizations').doc(checkout.organizationId);
  const organization = await organizationRef.get();
  const activeSubscriptionCode = String(organization.data()?.subscription?.paystackSubscriptionCode ?? '');
  const activePlan = String(organization.data()?.subscription?.plan ?? '');
  const appliesToCurrentSubscription = checkout.providerSubscriptionCode
    ? activeSubscriptionCode === checkout.providerSubscriptionCode
    : activePlan === checkout.plan;
  const batch = adminDb.batch();
  batch.set(adminDb.collection('billing_paystack_transactions').doc(reference), {
    status: 'reversed', failureReason: reason.slice(0, 1000), updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  if (appliesToCurrentSubscription) {
    batch.set(organizationRef, {
      'subscription.status': 'cancelled', 'subscription.cancelAtPeriodEnd': false,
    }, { merge: true });
  }
  await batch.commit();
}

export async function updatePaystackSubscriptionStatus(input: {
  subscriptionCode: string;
  status: StoredSubscriptionStatus;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean | null;
}): Promise<void> {
  if (isSupabaseBackendActive()) {
    const { error } = await getSupabaseAdminClient().rpc('update_paystack_subscription_status', {
      p_subscription_code: input.subscriptionCode,
      p_status: input.status,
      p_period_start: input.periodStart?.toISOString() ?? null,
      p_period_end: input.periodEnd?.toISOString() ?? null,
      p_cancel_at_period_end: input.cancelAtPeriodEnd ?? null,
    });
    assertSuccessful(error, 'Unable to update the Paystack subscription');
    return;
  }
  const snapshot = await adminDb.collection('billing_paystack_subscriptions')
    .where('subscriptionCode', '==', input.subscriptionCode).limit(1).get();
  if (snapshot.empty) throw new Error('Unknown Paystack subscription.');
  const organizationId = String(snapshot.docs[0].data().organizationId ?? snapshot.docs[0].id);
  const values: Record<string, unknown> = {
    'subscription.status': input.status,
    'subscription.provider': 'paystack',
  };
  if (input.periodStart) values['subscription.currentPeriodStart'] = Timestamp.fromDate(input.periodStart);
  if (input.periodEnd) values['subscription.currentPeriodEnd'] = Timestamp.fromDate(input.periodEnd);
  if (input.cancelAtPeriodEnd !== undefined && input.cancelAtPeriodEnd !== null) {
    values['subscription.cancelAtPeriodEnd'] = input.cancelAtPeriodEnd;
  }
  await adminDb.collection('organizations').doc(organizationId).update(values);
}

export async function claimPaystackWebhookEvent(input: { eventKey: string; eventType: string; payloadHash: string }) {
  if (isSupabaseBackendActive()) {
    const { data, error } = await getSupabaseAdminClient().rpc('claim_paystack_webhook_event', {
      p_event_key: input.eventKey, p_event_type: input.eventType, p_payload_hash: input.payloadHash,
    });
    assertSuccessful(error, 'Unable to claim the Paystack webhook event');
    return String(data) as 'claimed' | 'processed' | 'processing' | 'busy';
  }
  const ref = adminDb.collection('billing_paystack_webhook_events').doc(input.eventKey);
  return adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const row = snapshot.data();
    if (snapshot.exists && row?.status === 'processed') return 'processed' as const;
    const updatedAt = row?.updatedAt?.toDate?.() as Date | undefined;
    if (snapshot.exists && row?.status === 'processing' && updatedAt && Date.now() - updatedAt.getTime() < 600_000) {
      return 'processing' as const;
    }
    transaction.set(ref, {
      eventType: input.eventType, payloadHash: input.payloadHash, status: 'processing',
      attemptCount: Number(row?.attemptCount ?? 0) + 1, errorMessage: null,
      createdAt: row?.createdAt ?? FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return 'claimed' as const;
  });
}

export async function completePaystackWebhookEvent(eventKey: string, succeeded: boolean, errorMessage?: string) {
  if (isSupabaseBackendActive()) {
    const { error } = await getSupabaseAdminClient().rpc('complete_paystack_webhook_event', {
      p_event_key: eventKey, p_succeeded: succeeded, p_error_message: errorMessage ?? null,
    });
    assertSuccessful(error, 'Unable to complete the Paystack webhook event');
    return;
  }
  await adminDb.collection('billing_paystack_webhook_events').doc(eventKey).set({
    status: succeeded ? 'processed' : 'failed',
    processedAt: succeeded ? FieldValue.serverTimestamp() : null,
    errorMessage: succeeded ? null : (errorMessage ?? 'Unknown webhook failure').slice(0, 1000),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}
