import 'server-only';

import { getPaymentProvider } from '@/lib/payments/provider';
import { paystackPlanCode, updatePaystackPlan } from '@/lib/payments/paystack';

export async function synchronizePaystackPlanPrices(input: {
  proAmountMinor: number;
  enterpriseAmountMinor: number;
}) {
  if (getPaymentProvider() !== 'paystack') return { provider: 'stripe' as const, synchronized: false };
  for (const [label, amount] of [['Pro', input.proAmountMinor], ['Enterprise', input.enterpriseAmountMinor]] as const) {
    if (!Number.isSafeInteger(amount) || amount < 10) {
      throw new Error(`${label} must be at least GHS 0.10.`);
    }
  }
  const proPlanCode = paystackPlanCode('pro');
  const enterprisePlanCode = paystackPlanCode('enterprise');
  if (!proPlanCode || !enterprisePlanCode) {
    throw new Error('PAYSTACK_PLAN_CODE_PRO and PAYSTACK_PLAN_CODE_ENTERPRISE must be configured.');
  }
  await Promise.all([
    updatePaystackPlan({ planCode: proPlanCode, amountMinor: input.proAmountMinor, name: 'StockIntel Pro' }),
    updatePaystackPlan({ planCode: enterprisePlanCode, amountMinor: input.enterpriseAmountMinor, name: 'StockIntel Enterprise' }),
  ]);
  return { provider: 'paystack' as const, synchronized: true, proPlanCode, enterprisePlanCode };
}
