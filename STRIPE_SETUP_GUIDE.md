# Stripe Integration Guide for StockIntel

## Prerequisites
- Stripe Account (sign up at https://stripe.com)
- Node.js project with Next.js
- Firebase project configured

## Step 1: Create Stripe Account & Get API Keys

1. **Sign up at Stripe**: https://dashboard.stripe.com/register
2. **Navigate to Developers → API Keys**
3. **Copy your keys**:
   - **Publishable Key** (starts with `pk_test_` for test mode)
   - **Secret Key** (starts with `sk_test_` for test mode)

> [!IMPORTANT]
> Keep your Secret Key secure! Never expose it in client-side code.

---

## Step 2: Install Stripe Dependencies

```bash
npm install stripe @stripe/stripe-js
npm install --save-dev @types/stripe
```

---

## Step 3: Set Up Environment Variables

Create `.env.local` in your project root:

```env
# Stripe Keys
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
STRIPE_SECRET_KEY=sk_test_your_secret_key_here

# Stripe Webhook Secret (we'll get this later)
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Step 4: Create Stripe Products & Prices

### Option A: Via Stripe Dashboard (Recommended for beginners)

1. Go to **Products** in Stripe Dashboard
2. Click **Add Product**
3. Create three products:

**Product 1: StockIntel Pro**
- Name: StockIntel Pro
- Description: Professional plan with 20 workers
- Pricing: $5/month (recurring)
- Copy the **Price ID** (starts with `price_`)

**Product 2: StockIntel Enterprise**
- Name: StockIntel Enterprise
- Description: Enterprise plan with unlimited workers
- Pricing: $15/month (recurring)
- Copy the **Price ID**

### Option B: Via API (Programmatic)

Create a setup script `scripts/setup-stripe-products.ts`:

```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
});

async function setupProducts() {
  // Pro Plan
  const proPlan = await stripe.products.create({
    name: 'StockIntel Pro',
    description: 'Professional plan with 20 workers',
  });

  const proPrice = await stripe.prices.create({
    product: proPlan.id,
    unit_amount: 500, // $5.00 in cents
    currency: 'usd',
    recurring: { interval: 'month' },
  });

  console.log('Pro Price ID:', proPrice.id);

  // Enterprise Plan
  const enterprisePlan = await stripe.products.create({
    name: 'StockIntel Enterprise',
    description: 'Enterprise plan with unlimited workers',
  });

  const enterprisePrice = await stripe.prices.create({
    product: enterprisePlan.id,
    unit_amount: 1500, // $15.00 in cents
    currency: 'usd',
    recurring: { interval: 'month' },
  });

  console.log('Enterprise Price ID:', enterprisePrice.id);
}

setupProducts();
```

Run: `npx ts-node scripts/setup-stripe-products.ts`

---

## Step 5: Set Up Stripe Webhook

### Why Webhooks?
Webhooks notify your app when payment events occur (successful payment, failed payment, subscription cancelled, etc.)

### Create Webhook Endpoint

1. Go to **Developers → Webhooks** in Stripe Dashboard
2. Click **Add Endpoint**
3. **Endpoint URL**: `https://yourdomain.com/api/webhooks/stripe`
   - For local testing: Use Stripe CLI (see below)
4. **Select Events to Listen To**:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the **Signing Secret** (starts with `whsec_`)
6. Add to `.env.local` as `STRIPE_WEBHOOK_SECRET`

### Local Testing with Stripe CLI

```bash
# Install Stripe CLI
# Windows: Download from https://github.com/stripe/stripe-cli/releases

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

This will give you a webhook signing secret for testing.

---

## Step 6: Implementation Files

I'll create the following files for you:
1. `lib/stripe.ts` - Stripe client initialization
2. `app/api/checkout/route.ts` - Create checkout session
3. `app/api/webhooks/stripe/route.ts` - Handle webhook events
4. `app/dashboard/billing/page.tsx` - Billing & subscription management UI
5. `components/pricing/PricingCards.tsx` - Pricing display component

---

## Step 7: Testing Stripe Integration

### Test Card Numbers
Stripe provides test cards for different scenarios:

- **Success**: `4242 4242 4242 4242`
- **Decline**: `4000 0000 0000 0002`
- **Requires Authentication**: `4000 0025 0000 3155`

**Expiry**: Any future date (e.g., 12/34)
**CVC**: Any 3 digits (e.g., 123)
**ZIP**: Any 5 digits (e.g., 12345)

---

## Step 8: Go Live Checklist

Before going to production:

1. **Switch to Live Mode** in Stripe Dashboard
2. **Update Environment Variables** with live keys:
   - `pk_live_...`
   - `sk_live_...`
3. **Update Webhook Endpoint** to production URL
4. **Complete Stripe Account Activation**:
   - Provide business details
   - Add bank account for payouts
   - Verify identity
5. **Test Live Mode** with real payment (then refund)
6. **Set up Stripe Radar** for fraud prevention
7. **Configure Email Receipts** in Stripe settings

---

## Pricing Structure

Based on your requirements:
- **Free Trial**: 3 months, no payment required
- **Pro Plan**: $5/month (or equivalent in other currencies)
- **Enterprise Plan**: $15/month (3x multiplier)

The system will:
1. Track trial end date
2. Prompt upgrade before trial expires
3. Handle currency conversion automatically
4. Award referral credits

---

## Security Best Practices

1. **Never expose Secret Key** in client code
2. **Validate webhook signatures** to prevent fake events
3. **Use HTTPS** in production
4. **Store minimal payment data** (let Stripe handle it)
5. **Implement idempotency** for webhook handlers
6. **Log all payment events** for audit trail

---

## Support & Resources

- **Stripe Documentation**: https://stripe.com/docs
- **Stripe API Reference**: https://stripe.com/docs/api
- **Stripe Testing**: https://stripe.com/docs/testing
- **Stripe Support**: https://support.stripe.com

---

## Next Steps

Once you confirm, I will:
1. Create all the implementation files listed above
2. Integrate Stripe checkout flow
3. Add billing management page
4. Implement webhook handlers
5. Create pricing cards UI
6. Add subscription status tracking
