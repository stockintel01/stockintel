import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { db } from '@/lib/firebase';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import Stripe from 'stripe';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
        return NextResponse.json({ error: 'No signature' }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
        console.error('Webhook signature verification failed:', err.message);
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
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

        return NextResponse.json({ received: true });
    } catch (error: any) {
        console.error('Webhook handler error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const { organizationId, plan } = session.metadata || {};

    if (!organizationId) {
        console.error('No organizationId in session metadata');
        return;
    }

    // 1. Retrieve the subscription with explicit type assertion
    const subscription = await stripe.subscriptions.retrieve(
        session.subscription as string
    ) as Stripe.Subscription;

    // 2. CHECK: Is it canceled? If so, stop.
    if (subscription.status === 'canceled') {
        console.error('Subscription is canceled');
        return;
    }

    // 3. Safety check: ensure current_period_end exists and is a number
    if (typeof subscription.current_period_end !== 'number') {
        console.error('Subscription missing valid current_period_end');
        return;
    }

    const currentPeriodEnd = new Date(subscription.current_period_end * 1000);

    // Update organization in Firestore
    await updateDoc(doc(db, 'organizations', organizationId), {
        'subscription.plan': plan || 'pro',
        'subscription.status': 'active',
        'subscription.currentPeriodEnd': Timestamp.fromDate(currentPeriodEnd),
        'subscription.stripeSubscriptionId': subscription.id,
        'subscription.stripeCustomerId': subscription.customer as string,
    });

    console.log(`Subscription activated for org: ${organizationId}`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const { organizationId } = subscription.metadata || {};

    if (!organizationId) {
        console.error('No organizationId in subscription metadata');
        return;
    }

    // Safety check for current_period_end
    if (typeof subscription.current_period_end !== 'number') {
        console.error('Subscription missing valid current_period_end');
        return;
    }

    const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
    const status = subscription.status === 'active' ? 'active' : 'expired';

    await updateDoc(doc(db, 'organizations', organizationId), {
        'subscription.status': status,
        'subscription.currentPeriodEnd': Timestamp.fromDate(currentPeriodEnd),
    });

    console.log(`Subscription updated for org: ${organizationId}, status: ${status}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const { organizationId } = subscription.metadata || {};

    if (!organizationId) {
        console.error('No organizationId in subscription metadata');
        return;
    }

    await updateDoc(doc(db, 'organizations', organizationId), {
        'subscription.status': 'cancelled',
    });

    console.log(`Subscription cancelled for org: ${organizationId}`);
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
    console.log(`Payment succeeded for invoice: ${invoice.id}`);
    // You can send receipt emails here or log for analytics
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
    console.log(`Payment failed for invoice: ${invoice.id}`);
    // You can send notification emails here
}