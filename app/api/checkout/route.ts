/**
 * POST /api/checkout — initialize the configured payment provider.
 * action=portal opens the provider-hosted subscription management page.
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { randomBytes } from 'node:crypto';
import { getProductId, getStripeClient } from '@/lib/stripe';
import { ApiError, requireRole, requireUser } from '@/lib/api-auth';
import { getCheckoutBillingState, type PaidPlan } from '@/lib/billing/subscription-repository';
import { createPaystackCheckout, getPaystackSubscriptionSecret, markPaystackCheckoutFailed } from '@/lib/billing/paystack-repository';
import { getPaymentProvider } from '@/lib/payments/provider';
import {
    fetchPaystackPlan,
    generatePaystackSubscriptionManageLink,
    initializePaystackTransaction,
} from '@/lib/payments/paystack';
import { PAYSTACK_TERMS_VERSION } from '@/lib/payments/paystack-validation';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

export async function POST(req: NextRequest) {
    try {
        if (!APP_URL) throw new ApiError('NEXT_PUBLIC_APP_URL is not configured', 503);

        const user = await requireUser(req);
        requireRole(user, ['owner']);
        const { plan, organizationId, action, acceptedTerms, termsVersion } = await req.json();
        if (!organizationId || organizationId !== user.organizationId) {
            throw new ApiError('Invalid organization', 403);
        }

        const provider = getPaymentProvider();

        if (action === 'portal') {
            if (provider === 'paystack') {
                const subscription = await getPaystackSubscriptionSecret(organizationId);
                if (!subscription?.subscriptionCode) throw new ApiError('No Paystack subscription was found.', 404);
                const result = await generatePaystackSubscriptionManageLink(subscription.subscriptionCode);
                return NextResponse.json({ url: result.link, provider });
            }
            const stripe = getStripeClient();
            const billing = await getCheckoutBillingState(organizationId, 'pro');
            if (!billing.customerId) throw new ApiError('No active subscription found', 404);
            const session = await stripe.billingPortal.sessions.create({
                customer: billing.customerId,
                return_url: `${APP_URL}/dashboard/billing`,
            });
            return NextResponse.json({ url: session.url, provider });
        }

        if (!plan) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        if (plan !== 'pro' && plan !== 'enterprise') {
            return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
        }
        const selectedPlan = plan as PaidPlan;

        if (provider === 'paystack') {
            if (acceptedTerms !== true || termsVersion !== PAYSTACK_TERMS_VERSION) {
                throw new ApiError('Accept the current subscription, privacy, and refund terms before continuing.', 400);
            }
            if (!user.email) throw new ApiError('A verified email address is required for Paystack checkout.', 400);
            const billing = await getCheckoutBillingState(organizationId, selectedPlan, 'GHS');
            if (!billing.organizationExists) throw new ApiError('Organization not found', 404);
            if (!Number.isSafeInteger(billing.amountMinor) || billing.amountMinor < 10) {
                throw new ApiError('The configured GHS subscription amount is invalid.', 503);
            }
            if (!billing.paystackPlanCode) throw new ApiError(`The Paystack ${selectedPlan} plan is not configured.`, 503);

            const remotePlan = await fetchPaystackPlan(billing.paystackPlanCode);
            if (remotePlan.plan_code !== billing.paystackPlanCode
                || remotePlan.currency.toUpperCase() !== billing.currency
                || remotePlan.interval !== 'monthly'
                || Number(remotePlan.amount) !== billing.amountMinor) {
                throw new ApiError('The Paystack plan does not match the configured monthly price. Ask a platform administrator to synchronize billing.', 503);
            }

            const reference = `STKI-${Date.now().toString(36)}-${randomBytes(8).toString('hex')}`;
            await createPaystackCheckout({
                reference,
                organizationId,
                userId: user.uid,
                plan: selectedPlan,
                planCode: billing.paystackPlanCode,
                customerEmail: user.email.trim().toLowerCase(),
                amountMinor: billing.amountMinor,
                currency: billing.currency,
                termsVersion: PAYSTACK_TERMS_VERSION,
                termsAcceptedAt: new Date(),
            });
            try {
                const transaction = await initializePaystackTransaction({
                    email: user.email,
                    amountMinor: billing.amountMinor,
                    currency: billing.currency,
                    reference,
                    planCode: billing.paystackPlanCode,
                    callbackUrl: `${APP_URL}/api/payments/paystack/callback`,
                    cancelUrl: `${APP_URL}/dashboard/billing?canceled=true`,
                    metadata: { organizationId, userId: user.uid, plan: selectedPlan, termsVersion: PAYSTACK_TERMS_VERSION },
                });
                if (transaction.reference !== reference || !transaction.authorization_url.startsWith('https://checkout.paystack.com/')) {
                    throw new Error('Paystack returned an invalid checkout response.');
                }
                return NextResponse.json({ url: transaction.authorization_url, reference, provider });
            } catch (error) {
                await markPaystackCheckoutFailed(reference, error instanceof Error ? error.message : 'Paystack initialization failed');
                throw error;
            }
        }

        const stripe = getStripeClient();
        const billing = await getCheckoutBillingState(organizationId, selectedPlan);
        if (!billing.organizationExists) throw new ApiError('Organization not found', 404);
        const unitAmount = billing.amountMinor;
        if (!Number.isSafeInteger(unitAmount) || unitAmount < 50) throw new ApiError('The configured subscription amount is invalid', 503);

        const productId = getProductId(selectedPlan);
        const priceData: Stripe.Checkout.SessionCreateParams.LineItem.PriceData = {
            currency: 'usd',
            unit_amount: unitAmount,
            recurring: { interval: 'month' },
            ...(productId
                ? { product: productId }
                : { product_data: { name: selectedPlan === 'pro' ? 'StockIntel Pro' : 'StockIntel Enterprise' } }),
        };
        const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = {
            price_data: priceData,
            quantity: 1,
        };

        
        const sessionConfig: Stripe.Checkout.SessionCreateParams = {
            mode:                   'subscription',
            payment_method_types:   ['card'],
            line_items:             [lineItem],
            success_url:            `${APP_URL}/dashboard/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url:             `${APP_URL}/dashboard/billing?canceled=true`,
            metadata:               { organizationId, userId: user.uid, plan },
            subscription_data:      { metadata: { organizationId, userId: user.uid, plan } },
            allow_promotion_codes:  true,
            billing_address_collection: 'auto',
        };
        if (billing.customerId) {
            sessionConfig.customer = billing.customerId;
        } else if (user.email) {
            sessionConfig.customer_email = user.email;
        }

        const session = await stripe.checkout.sessions.create(sessionConfig);
        return NextResponse.json({ sessionId: session.id, url: session.url, provider });

    } catch (error: unknown) {
        console.error('Checkout error:', error);
        const status = error instanceof ApiError ? error.status : 500;
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Checkout failed' }, { status });
    }
}
