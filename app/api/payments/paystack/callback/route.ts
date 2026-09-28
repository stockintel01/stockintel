import { NextRequest, NextResponse } from 'next/server';

import { processVerifiedPaystackPayment } from '@/lib/billing/paystack-events';
import { verifyPaystackTransaction } from '@/lib/payments/paystack';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

export async function GET(request: NextRequest) {
  const destination = new URL('/dashboard/billing', APP_URL || request.nextUrl.origin);
  const reference = request.nextUrl.searchParams.get('reference')?.trim() ?? '';
  if (!/^[A-Za-z0-9.=-]{8,100}$/.test(reference)) {
    destination.searchParams.set('payment', 'invalid-reference');
    return NextResponse.redirect(destination);
  }
  try {
    const transaction = await verifyPaystackTransaction(reference);
    await processVerifiedPaystackPayment(transaction);
    destination.searchParams.set('payment', 'success');
    destination.searchParams.set('reference', reference);
  } catch (error) {
    console.error('[Paystack callback] verification failed:', error);
    destination.searchParams.set('payment', 'verification-failed');
  }
  return NextResponse.redirect(destination);
}
