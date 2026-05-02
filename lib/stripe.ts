import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not defined in environment variables');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-12-18.acacia',
    typescript: true,
});

// Price IDs - Update these after creating products in Stripe Dashboard
export const STRIPE_PRICE_IDS = {
    PRO_MONTHLY: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO || 'price_pro_monthly',
    ENTERPRISE_MONTHLY: process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE || 'price_enterprise_monthly',
};

// Helper to get price based on plan
export function getPriceId(plan: 'pro' | 'enterprise'): string {
    return plan === 'pro' ? STRIPE_PRICE_IDS.PRO_MONTHLY : STRIPE_PRICE_IDS.ENTERPRISE_MONTHLY;
}
