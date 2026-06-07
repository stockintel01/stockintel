/**
 * POST /api/checkout  — create a Stripe Checkout session
 * POST /api/checkout/portal — create a Stripe Customer Portal session
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getPriceId, getStripeClient } from '@/lib/stripe';
import { adminDb } from '@/lib/firebase-admin';
import { ApiError, requireRole, requireUser } from '@/lib/api-auth';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

export async function POST(req: NextRequest) {
    try {
        if (!APP_URL) throw new ApiError('NEXT_PUBLIC_APP_URL is not configured', 503);

        const stripe = getStripeClient();
        const user = await requireUser(req);
        requireRole(user, ['owner']);
        const { plan, organizationId, action } = await req.json();
        if (!organizationId || organizationId !== user.organizationId) {
            throw new ApiError('Invalid organization', 403);
        }

        // ── Customer portal ───────────────────────────────────────────────
        if (action === 'portal') {
            const orgSnap = await adminDb.collection('organizations').doc(organizationId).get();
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
        if (!plan) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }
        if (plan !== 'pro' && plan !== 'enterprise') {
            return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
        }

        // Check if org already has a Stripe customer ID (reuse it)
        const orgSnap = await adminDb.collection('organizations').doc(organizationId).get();
        if (!orgSnap.exists) throw new ApiError('Organization not found', 404);
        const existingCustomerId = orgSnap.data()?.subscription?.stripeCustomerId;

        
        const sessionConfig: Stripe.Checkout.SessionCreateParams = {
            mode:                   'subscription',
            payment_method_types:   ['card'],
            line_items:             [{ price: getPriceId(plan), quantity: 1 }],
            success_url:            `${APP_URL}/dashboard/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url:             `${APP_URL}/dashboard/billing?canceled=true`,
            metadata:               { organizationId, userId: user.uid, plan },
            subscription_data:      { metadata: { organizationId, userId: user.uid, plan } },
            allow_promotion_codes:  true,
            billing_address_collection: 'auto',
        };
        if (existingCustomerId) {
            sessionConfig.customer = existingCustomerId;
        } else if (user.email) {
            sessionConfig.customer_email = user.email;
        }

        const session = await stripe.checkout.sessions.create(sessionConfig);
        return NextResponse.json({ sessionId: session.id, url: session.url });

    } catch (error: unknown) {
        console.error('Checkout error:', error);
        const status = error instanceof ApiError ? error.status : 500;
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Checkout failed' }, { status });
    }
}
