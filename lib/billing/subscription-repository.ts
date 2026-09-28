import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';

import { adminDb } from '@/lib/firebase-admin';
import { isSupabaseBackendActive } from '@/lib/supabase/config';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { paystackPlanCode } from '@/lib/payments/paystack';

export type PaidPlan = 'pro' | 'enterprise';
export type StoredSubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'expired' | 'cancelled';

export interface CheckoutBillingState {
  organizationExists: boolean;
  customerId: string | null;
  amountMinor: number;
  currency: 'GHS' | 'USD';
  stripePriceId: string | null;
  paystackPlanCode: string | null;
}

export interface SubscriptionWrite {
  organizationId: string;
  plan?: PaidPlan;
  status: StoredSubscriptionStatus;
  customerId?: string | null;
  subscriptionId?: string | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
}

function assertSuccessful(error: { message?: string } | null, operation: string) {
  if (error) throw new Error(`${operation}: ${error.message ?? 'database operation failed'}`);
}

export async function getCheckoutBillingState(
  organizationId: string,
  plan: PaidPlan,
  currency: 'GHS' | 'USD' = 'USD',
): Promise<CheckoutBillingState> {
  if (isSupabaseBackendActive()) {
    const client = getSupabaseAdminClient();
    const [organizationResult, subscriptionResult, priceResult] = await Promise.all([
      client.from('organizations').select('id').eq('id', organizationId).maybeSingle(),
      client.from('organization_subscriptions')
        .select('provider_customer_id')
        .eq('organization_id', organizationId)
        .maybeSingle(),
      client.from('plan_prices')
        .select('amount_minor, stripe_price_id, paystack_plan_code')
        .eq('plan_id', plan)
        .eq('currency', currency)
        .eq('interval', 'monthly')
        .eq('active', true)
        .maybeSingle(),
    ]);

    assertSuccessful(organizationResult.error, 'Unable to load the organization');
    assertSuccessful(subscriptionResult.error, 'Unable to load the subscription');
    assertSuccessful(priceResult.error, 'Unable to load the plan price');

    const amountMinor = priceResult.data ? Number(priceResult.data.amount_minor) : 0;
    return {
      organizationExists: Boolean(organizationResult.data),
      customerId: String(subscriptionResult.data?.provider_customer_id ?? '').trim() || null,
      amountMinor,
      currency,
      stripePriceId: String(priceResult.data?.stripe_price_id ?? '').trim() || null,
      paystackPlanCode: String(priceResult.data?.paystack_plan_code ?? '').trim() || paystackPlanCode(plan),
    };
  }

  const [organizationSnapshot, configSnapshot] = await Promise.all([
    adminDb.collection('organizations').doc(organizationId).get(),
    adminDb.collection('system').doc('config').get(),
  ]);
  const pricing = configSnapshot.data()?.subscriptionPricing;
  const baseUSD = Number(pricing?.baseUSD ?? 9);
  const baseGHS = Number(pricing?.baseGHS ?? baseUSD);
  const multiplier = Number(plan === 'pro'
    ? pricing?.proPlanMultiplier ?? 1
    : pricing?.enterprisePlanMultiplier ?? 3);

  return {
    organizationExists: organizationSnapshot.exists,
    customerId: String(organizationSnapshot.data()?.subscription?.stripeCustomerId ?? '').trim() || null,
    amountMinor: Math.round((currency === 'GHS' ? baseGHS : baseUSD) * multiplier * 100),
    currency,
    stripePriceId: null,
    paystackPlanCode: paystackPlanCode(plan),
  };
}

export async function writeSubscription(input: SubscriptionWrite): Promise<void> {
  if (isSupabaseBackendActive()) {
    const client = getSupabaseAdminClient();
    const values: Record<string, unknown> = {
      organization_id: input.organizationId,
      status: input.status,
      provider: 'stripe',
      updated_at: new Date().toISOString(),
    };
    if (input.plan) values.plan_id = input.plan;
    if (input.customerId !== undefined) values.provider_customer_id = input.customerId;
    if (input.subscriptionId !== undefined) values.provider_subscription_id = input.subscriptionId;
    if (input.currentPeriodStart !== undefined) {
      values.current_period_start = input.currentPeriodStart?.toISOString() ?? null;
    }
    if (input.currentPeriodEnd !== undefined) {
      values.current_period_end = input.currentPeriodEnd?.toISOString() ?? null;
    }
    if (input.cancelAtPeriodEnd !== undefined) values.cancel_at_period_end = input.cancelAtPeriodEnd;

    if (input.plan) {
      const { error } = await client.from('organization_subscriptions')
        .upsert(values, { onConflict: 'organization_id' });
      assertSuccessful(error, 'Unable to save the subscription');
      return;
    }

    const { error } = await client.from('organization_subscriptions')
      .update(values)
      .eq('organization_id', input.organizationId);
    assertSuccessful(error, 'Unable to update the subscription');
    return;
  }

  const values: Record<string, unknown> = {
    'subscription.status': input.status,
  };
  if (input.plan) values['subscription.plan'] = input.plan;
  if (input.customerId !== undefined) values['subscription.stripeCustomerId'] = input.customerId;
  if (input.subscriptionId !== undefined) values['subscription.stripeSubscriptionId'] = input.subscriptionId;
  if (input.currentPeriodStart !== undefined) {
    values['subscription.currentPeriodStart'] = input.currentPeriodStart
      ? Timestamp.fromDate(input.currentPeriodStart)
      : null;
  }
  if (input.currentPeriodEnd !== undefined) {
    values['subscription.currentPeriodEnd'] = input.currentPeriodEnd
      ? Timestamp.fromDate(input.currentPeriodEnd)
      : null;
  }
  if (input.cancelAtPeriodEnd !== undefined) {
    values['subscription.cancelAtPeriodEnd'] = input.cancelAtPeriodEnd;
  }
  await adminDb.collection('organizations').doc(input.organizationId).update(values);
}

export async function updateSubscriptionByProviderId(
  subscriptionId: string,
  status: StoredSubscriptionStatus,
): Promise<void> {
  if (isSupabaseBackendActive()) {
    const { error } = await getSupabaseAdminClient()
      .from('organization_subscriptions')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('provider_subscription_id', subscriptionId);
    assertSuccessful(error, 'Unable to update the subscription payment status');
    return;
  }

  const snapshot = await adminDb.collection('organizations')
    .where('subscription.stripeSubscriptionId', '==', subscriptionId)
    .limit(1)
    .get();
  if (!snapshot.empty) {
    await snapshot.docs[0].ref.update({ 'subscription.status': status });
  }
}

export async function claimStripeWebhookEvent(input: {
  eventId: string;
  eventType: string;
  apiVersion: string | null;
  createdAt: Date;
}): Promise<'claimed' | 'processed' | 'processing' | 'busy'> {
  if (!isSupabaseBackendActive()) return 'claimed';

  const { data, error } = await getSupabaseAdminClient().rpc('claim_stripe_webhook_event', {
    p_event_id: input.eventId,
    p_event_type: input.eventType,
    p_api_version: input.apiVersion,
    p_stripe_created_at: input.createdAt.toISOString(),
  });
  assertSuccessful(error, 'Unable to claim the Stripe webhook event');
  return String(data ?? 'busy') as 'claimed' | 'processed' | 'processing' | 'busy';
}

export async function completeStripeWebhookEvent(
  eventId: string,
  succeeded: boolean,
  errorMessage?: string,
): Promise<void> {
  if (!isSupabaseBackendActive()) return;
  const { error } = await getSupabaseAdminClient().rpc('complete_stripe_webhook_event', {
    p_event_id: eventId,
    p_succeeded: succeeded,
    p_error_message: errorMessage ?? null,
  });
  assertSuccessful(error, 'Unable to complete the Stripe webhook event');
}
