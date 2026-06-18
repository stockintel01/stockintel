import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { ApiError, requireFirebaseUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import type { IndustryType } from '@/lib/store';

function generateReferralCode(name: string): string {
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const prefix = name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X') || 'ORG';
    return `${prefix}-${random}`;
}

export async function POST(request: NextRequest) {
    try {
        const user = await requireFirebaseUser(request);
        const { industry, orgName, referrerCode } = await request.json();
        if (!['pharmacy', 'agriculture', 'retail'].includes(industry)) {
            throw new ApiError('Valid industry is required', 400);
        }
        const safeName = String(orgName ?? '').trim();
        if (safeName.length < 2) throw new ApiError('Organization name is required', 400);

        const existingProfile = await adminDb.collection('users').doc(user.uid).get();
        if (existingProfile.exists) throw new ApiError('User profile already exists', 409);

        const orgRef = adminDb.collection('organizations').doc();
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + 14);

        const orgData = {
            id: orgRef.id,
            name: safeName,
            industry: industry as IndustryType,
            ownerId: user.uid,
            referralCode: generateReferralCode(safeName),
            subscription: {
                plan: 'free_trial',
                status: 'active',
                trialEndsAt: Timestamp.fromDate(trialEndsAt),
            },
            createdAt: FieldValue.serverTimestamp(),
        };

        let referrerOrgId = '';
        const code = String(referrerCode ?? '').trim();
        if (code) {
            const referralSnap = await adminDb.collection('organizations')
                .where('referralCode', '==', code)
                .limit(1)
                .get();
            referrerOrgId = referralSnap.empty ? '' : referralSnap.docs[0].id;
        }

        const batch = adminDb.batch();
        batch.set(orgRef, referrerOrgId ? { ...orgData, invitedByOrgId: referrerOrgId } : orgData);
        if (referrerOrgId) {
            batch.set(adminDb.collection(`organizations/${referrerOrgId}/credits`).doc(), {
                amountMonths: 1,
                reason: 'signup_referral',
                status: 'available',
                fromOrgId: orgRef.id,
                createdAt: FieldValue.serverTimestamp(),
            });
        }
        await batch.commit();

        return NextResponse.json({ organizationId: orgRef.id });
    } catch (error) {
        const status = error instanceof ApiError ? error.status : 400;
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create organization' }, { status });
    }
}
