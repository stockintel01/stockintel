import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { ApiError, requireRole, requireUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
    try {
        const user = await requireUser(request);
        requireRole(user, ['owner']);
        const { creditId } = await request.json();
        if (!creditId) throw new ApiError('Credit ID is required', 400);

        const orgRef = adminDb.collection('organizations').doc(user.organizationId);
        const creditRef = orgRef.collection('credits').doc(creditId);
        await adminDb.runTransaction(async transaction => {
            const [orgSnap, creditSnap] = await Promise.all([transaction.get(orgRef), transaction.get(creditRef)]);
            if (!orgSnap.exists || !creditSnap.exists) throw new ApiError('Credit not found', 404);
            const credit = creditSnap.data() ?? {};
            if (credit.status !== 'available' || !Number.isInteger(credit.amountMonths) || credit.amountMonths < 1 || credit.amountMonths > 12) {
                throw new ApiError('Credit is not available', 409);
            }
            const subscription = orgSnap.data()?.subscription ?? {};
            const rawEnd = subscription.currentPeriodEnd ?? subscription.trialEndsAt;
            const currentEnd = rawEnd?.toDate?.() ?? new Date(rawEnd ?? Date.now());
            const base = currentEnd.getTime() > Date.now() ? currentEnd : new Date();
            base.setMonth(base.getMonth() + credit.amountMonths);
            transaction.update(orgRef, {
                'subscription.status': 'active',
                'subscription.currentPeriodEnd': base,
                'subscription.trialEndsAt': base,
            });
            transaction.update(creditRef, { status: 'used', usedAt: FieldValue.serverTimestamp(), usedBy: user.uid });
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        const status = error instanceof ApiError ? error.status : 400;
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to activate credit' }, { status });
    }
}
