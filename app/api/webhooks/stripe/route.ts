import { NextRequest, NextResponse } from 'next/server';
import { getStripeClient } from '@/lib/stripe';
import {
    claimStripeWebhookEvent,
    completeStripeWebhookEvent,
    updateSubscriptionByProviderId,
    writeSubscription,
    type PaidPlan,
    type StoredSubscriptionStatus,
} from '@/lib/billing/subscription-repository';
import Stripe from 'stripe';

function getCurrentPeriodStart(subscription: Stripe.Subscription | Stripe.Response<Stripe.Subscription>) {
    const legacyValue = (subscription as unknown as { current_period_start?: unknown }).current_period_start;
    if (typeof legacyValue === 'number') return legacyValue;
    return subscription.items.data[0]?.current_period_start;
}

function getCurrentPeriodEnd(subscription: Stripe.Subscription | Stripe.Response<Stripe.Subscription>) {
    const legacyValue = (subscription as unknown as { current_period_end?: unknown }).current_period_end;
    if (typeof legacyValue === 'number') return legacyValue;
    return subscription.items.data[0]?.current_period_end;
}

function stripeStatus(status: Stripe.Subscription.Status): StoredSubscriptionStatus {
    if (status === 'trialing') return 'trialing';
    if (status === 'active') return 'active';
    if (status === 'canceled') return 'cancelled';
    if (status === 'incomplete_expired') return 'expired';
    return 'past_due';
}

function paidPlan(value: unknown): PaidPlan {
    return value === 'enterprise' ? 'enterprise' : 'pro';
}

function referenceId(value: string | { id: string } | null | undefined) {
    return typeof value === 'string' ? value : value?.id ?? null;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
    const legacy = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription;
    if (legacy) return referenceId(legacy);
    const parent = invoice.parent;
    if (parent?.type !== 'subscription_details') return null;
    return referenceId(parent.subscription_details?.subscription);
}

export async function POST(req: NextRequest) {
    const stripe = getStripeClient();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
        return NextResponse.json({ error: 'No signature' }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: unknown) {
        console.error('Webhook signature verification failed:', err instanceof Error ? err.message : err);
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const claim = await claimStripeWebhookEvent({
        eventId: event.id,
        eventType: event.type,
        apiVersion: event.api_version,
        createdAt: new Date(event.created * 1000),
    });
    if (claim !== 'claimed') {
        return NextResponse.json({ received: true, duplicate: true });
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object as Stripe.Checkout.Session;
                await handleCheckoutCompleted(session);
                break;
            }
            case 'customer.subscription.updated': {
                const subscription = event.data.object as Stripe.Subscription;
                await handleSubscriptionUpdated(subscription);
                break;
            }
            case 'customer.subscription.deleted': {
                const subscription = event.data.object as Stripe.Subscription;
                await handleSubscriptionDeleted(subscription);
                break;
            }
            case 'invoice.payment_succeeded': {
                const invoice = event.data.object as Stripe.Invoice;
                await handlePaymentSucceeded(invoice);
                break;
            }
            case 'invoice.payment_failed': {
                const invoice = event.data.object as Stripe.Invoice;
                await handlePaymentFailed(invoice);
                break;
            }
            default:
                console.log(`Unhandled event type: ${event.type}`);
        }

        await completeStripeWebhookEvent(event.id, true);
        return NextResponse.json({ received: true });
    } catch (error: unknown) {
        console.error('Webhook handler error:', error);
        try {
            await completeStripeWebhookEvent(
                event.id,
                false,
                error instanceof Error ? error.message : 'Webhook failed',
            );
        } catch (completionError) {
            console.error('Unable to record webhook failure:', completionError);
        }
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Webhook failed' }, { status: 500 });
    }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const stripe = getStripeClient();
    const { organizationId, plan } = session.metadata || {};

    if (!organizationId) {
        throw new Error('No organizationId in session metadata');
    }

    const subscriptionId = referenceId(session.subscription);
    if (!subscriptionId) throw new Error('Checkout session has no subscription ID');

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    if (subscription.status === 'canceled') {
        throw new Error('Checkout completed with a canceled subscription');
    }

    const currentPeriodStartValue = getCurrentPeriodStart(subscription);
    const currentPeriodEndValue = getCurrentPeriodEnd(subscription);
    if (typeof currentPeriodEndValue !== 'number') {
        throw new Error('Subscription missing valid current_period_end');
    }

    await writeSubscription({
        organizationId,
        plan: paidPlan(plan),
        status: stripeStatus(subscription.status),
        currentPeriodStart: typeof currentPeriodStartValue === 'number'
            ? new Date(currentPeriodStartValue * 1000)
            : null,
        currentPeriodEnd: new Date(currentPeriodEndValue * 1000),
        subscriptionId: subscription.id,
        customerId: referenceId(subscription.customer),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
    });

    console.log(`Subscription activated for org: ${organizationId}`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const { organizationId } = subscription.metadata || {};

    if (!organizationId) {
        throw new Error('No organizationId in subscription metadata');
    }

    const currentPeriodStartValue = getCurrentPeriodStart(subscription);
    const currentPeriodEndValue = getCurrentPeriodEnd(subscription);
    if (typeof currentPeriodEndValue !== 'number') {
        throw new Error('Subscription missing valid current_period_end');
    }

    const status = stripeStatus(subscription.status);
    await writeSubscription({
        organizationId,
        status,
        currentPeriodStart: typeof currentPeriodStartValue === 'number'
            ? new Date(currentPeriodStartValue * 1000)
            : null,
        currentPeriodEnd: new Date(currentPeriodEndValue * 1000),
        subscriptionId: subscription.id,
        customerId: referenceId(subscription.customer),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
    });

    console.log(`Subscription updated for org: ${organizationId}, status: ${status}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const { organizationId } = subscription.metadata || {};

    if (!organizationId) {
        throw new Error('No organizationId in subscription metadata');
    }

    await writeSubscription({
        organizationId,
        status: 'cancelled',
        subscriptionId: subscription.id,
        customerId: referenceId(subscription.customer),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
    });

    console.log(`Subscription cancelled for org: ${organizationId}`);
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
    const subscriptionId = invoiceSubscriptionId(invoice);
    if (subscriptionId) await updateSubscriptionByProviderId(subscriptionId, 'active');
    console.log(`Payment succeeded for invoice: ${invoice.id}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
    const subscriptionId = invoiceSubscriptionId(invoice);
    if (subscriptionId) await updateSubscriptionByProviderId(subscriptionId, 'past_due');
    console.log(`Payment failed for invoice: ${invoice.id}`);
}
