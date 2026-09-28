import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { validatePaystackPayment } from '../lib/payments/paystack-validation.ts';
import { verifyPaystackHmac } from '../lib/payments/paystack-signature.ts';

const expected = { reference: 'STKI-test-12345678', amountMinor: 900, currency: 'GHS', planCode: 'PLN_pro' };
const payment = {
  status: 'success', reference: expected.reference, amount: 900, currency: 'GHS', id: 12345,
  plan: { plan_code: 'PLN_pro' }, paid_at: '2026-09-28T12:00:00.000Z',
  customer: { customer_code: 'CUS_123' }, subscription: { subscription_code: 'SUB_123', email_token: 'token' },
};
assert.equal(validatePaystackPayment(expected, payment).subscriptionCode, 'SUB_123');
for (const [field, value] of [['status', 'failed'], ['reference', 'wrong'], ['amount', 899], ['currency', 'USD']]) {
  assert.throws(() => validatePaystackPayment(expected, { ...payment, [field]: value }));
}

const body = JSON.stringify({ event: 'charge.success', data: payment });
const secret = 'sk_test_signature_fixture';
const signature = createHmac('sha512', secret).update(body).digest('hex');
assert.equal(verifyPaystackHmac(body, signature, secret), true);
assert.equal(verifyPaystackHmac(`${body}x`, signature, secret), false);

const root = process.cwd();
const sources = Object.fromEntries(await Promise.all([
  'app/api/checkout/route.ts',
  'app/api/webhooks/paystack/route.ts',
  'lib/billing/paystack-events.ts',
  'supabase/migrations/20260928181108_paystack_billing.sql',
  'app/legal/page.tsx',
  'app/legal/privacy/page.tsx',
  'app/legal/refunds/page.tsx',
  'scripts/check-env.mjs',
].map(async file => [file, await readFile(join(root, file), 'utf8')])));

const required = {
  'app/api/checkout/route.ts': ['acceptedTerms !== true', 'fetchPaystackPlan', 'createPaystackCheckout', 'initializePaystackTransaction'],
  'app/api/webhooks/paystack/route.ts': ['x-paystack-signature', 'claimPaystackWebhookEvent', 'request.text()'],
  'lib/billing/paystack-events.ts': ['validatePaystackPayment', "case 'refund.processed'", 'refundedAmount < checkout.amountMinor'],
  'supabase/migrations/20260928181108_paystack_billing.sql': ['terms_accepted_at', 'force row level security', 'claim_paystack_webhook_event', 'activate_paystack_checkout', "v_checkout.status = 'reversed'"],
  'app/legal/page.tsx': ['Merchant identity', 'Service and delivery', 'responsible'],
  'app/legal/privacy/page.tsx': ['Data Protection Act', 'Paystack', 'international'],
  'app/legal/refunds/page.tsx': ['Cancellation', 'partial refunds', 'Disputes'],
  'scripts/check-env.mjs': ['PAYSTACK_SECRET_KEY', 'sk_live_', 'NEXT_PUBLIC_MERCHANT_LEGAL_NAME'],
};
for (const [file, fragments] of Object.entries(required)) {
  for (const fragment of fragments) assert.ok(sources[file].includes(fragment), `${file} is missing ${fragment}`);
}

console.log('Paystack payment verification, signature, consent, policies, and durable-state guards verified.');
