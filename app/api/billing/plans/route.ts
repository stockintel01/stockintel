import { NextRequest, NextResponse } from 'next/server';

import { ApiError, requireUser } from '@/lib/api-auth';
import { getCheckoutBillingState } from '@/lib/billing/subscription-repository';
import { getBillingCurrency, getPaymentProvider } from '@/lib/payments/provider';
import { PAYSTACK_TERMS_VERSION } from '@/lib/payments/paystack-validation';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user.organizationId) throw new ApiError('No active workspace', 400);
    const provider = getPaymentProvider();
    const currency = getBillingCurrency(provider);
    const [pro, enterprise] = await Promise.all([
      getCheckoutBillingState(user.organizationId, 'pro', currency),
      getCheckoutBillingState(user.organizationId, 'enterprise', currency),
    ]);
    return NextResponse.json({
      provider,
      currency,
      termsVersion: PAYSTACK_TERMS_VERSION,
      plans: {
        pro: { amountMinor: pro.amountMinor, configured: Number.isSafeInteger(pro.amountMinor) && pro.amountMinor > 0 && (provider === 'stripe' || Boolean(pro.paystackPlanCode)) },
        enterprise: { amountMinor: enterprise.amountMinor, configured: Number.isSafeInteger(enterprise.amountMinor) && enterprise.amountMinor > 0 && (provider === 'stripe' || Boolean(enterprise.paystackPlanCode)) },
      },
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load billing plans' }, { status });
  }
}
