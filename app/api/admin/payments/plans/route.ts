import { NextRequest, NextResponse } from 'next/server';

import { ApiError, requireUser } from '@/lib/api-auth';
import { synchronizePaystackPlanPrices } from '@/lib/billing/paystack-plan-admin';

function amount(value: unknown, label: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 10) throw new ApiError(`${label} is invalid`, 400);
  return parsed;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (user.role !== 'super_admin') throw new ApiError('Platform administrator access is required', 403);
    const body = await request.json() as Record<string, unknown>;
    const result = await synchronizePaystackPlanPrices({
      proAmountMinor: amount(body.proAmountMinor, 'Pro price'),
      enterpriseAmountMinor: amount(body.enterpriseAmountMinor, 'Enterprise price'),
    });
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to synchronize payment plans' }, { status });
  }
}
