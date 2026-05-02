/**
 * POST /api/checkout  — create a Stripe Checkout session
 * POST /api/checkout/portal — create a Stripe Customer Portal session
 */

import { NextRequest, NextResponse } from 'next/server';
import { stripe, getPriceId } from '@/lib/stripe';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function POST(req: NextRequest) {
    try {
        const { plan, organizationId, userId, userEmail, action } = await req.json();

        // ── Customer portal ───────────────────────────────────────────────
        if (action === 'portal') {
            const orgSnap = await getDoc(doc(db, 'organizations', organizationId));
            const customerId = orgSnap.data()?.subscription?.stripeCustomerId;
            if (!customerId) {
                return NextResponse.json({ error: 'No active subscription found' }, { status: 404 });
            }
            const session = await stripe.billingPortal.sessions.create({
                customer:   customerId,
                return_url: `${APP_URL}/dashboard/billing`,
            });
            return NextResponse.json({ url: session.url });
        }

        // ── New checkout ──────────────────────────────────────────────────
        if (!plan || !organizationId || !userId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }
        if (plan !== 'pro' && plan !== 'enterprise') {
            return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
        }

        // Check if org already has a Stripe customer ID (reuse it)
        const orgSnap = await getDoc(doc(db, 'organizations', organizationId));
        const existingCustomerId = orgSnap.data()?.subscription?.stripeCustomerId;

        
        const sessionConfig: Stripe.Checkout.SessionCreateParams = {
            mode:                   'subscription',
            payment_method_types:   ['card'],
            line_items:             [{ price: getPriceId(plan), quantity: 1 }],
            success_url:            `${APP_URL}/dashboard/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url:             `${APP_URL}/dashboard/billing?canceled=true`,
            metadata:               { organizationId, userId, plan },
            subscription_data:      { metadata: { organizationId, userId, plan } },
            allow_promotion_codes:  true,
            billing_address_collection: 'auto',
        };
        if (existingCustomerId) {
            sessionConfig.customer = existingCustomerId;
        } else if (userEmail) {
            sessionConfig.customer_email = userEmail;
        }

        const session = await stripe.checkout.sessions.create(sessionConfig);
        return NextResponse.json({ sessionId: session.id, url: session.url });

    } catch (error: unknown) {
        console.error('Checkout error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Checkout failed' },
            { status: 500 }
        );
    }
}
