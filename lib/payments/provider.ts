export type PaymentProvider = 'paystack' | 'stripe';

export function getPaymentProvider(): PaymentProvider {
  const configured = process.env.PAYMENT_PROVIDER?.trim().toLowerCase();
  if (configured === 'paystack' || configured === 'stripe') return configured;
  if (process.env.PAYSTACK_SECRET_KEY) return 'paystack';
  if (process.env.STRIPE_SECRET_KEY) return 'stripe';
  return 'paystack';
}

export function getBillingCurrency(provider = getPaymentProvider()): 'GHS' | 'USD' {
  return provider === 'paystack' ? 'GHS' : 'USD';
}

export function paymentProviderName(provider = getPaymentProvider()) {
  return provider === 'paystack' ? 'Paystack' : 'Stripe';
}
