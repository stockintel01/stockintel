import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { ApiError, requireFeature, requireRole, requireUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { getPlanLimit } from '@/lib/plans';
import { normalizeAccess, ACCESS_PRESETS } from '@/lib/access-permissions';
import type { IndustryType } from '@/lib/store';

export async function POST(request: NextRequest) {
    try {
        const user = await requireUser(request);
        requireRole(user, ['owner', 'manager']);
        requireFeature(user, 'team');
        const { email, role, orgName, invitedBy, access } = await request.json();
        if (!email || !['manager', 'worker'].includes(role)) throw new ApiError('Valid email and role are required', 400);
        const orgSnapshot = await adminDb.collection('organizations').doc(user.organizationId).get();
        if (!orgSnapshot.exists) throw new ApiError('Organization not found', 404);
        const industry = 'agriculture' as IndustryType;
        const defaultAccess = ACCESS_PRESETS[industry].find(preset => preset.role === role)?.access ?? [];
        const normalizedAccess = normalizeAccess(Array.isArray(access) ? access : defaultAccess, industry);

        const members = await adminDb.collection('users').where('organizationId', '==', user.organizationId).count().get();
        const pending = await adminDb.collection('invitations')
            .where('organizationId', '==', user.organizationId).where('status', '==', 'pending').count().get();
        const limit = getPlanLimit(user.subscription, 'teamMembers', user.role === 'super_admin');
        if (members.data().count + pending.data().count >= limit) throw new ApiError(`Your plan allows up to ${limit} team members`, 403);

        const ref = adminDb.collection('invitations').doc();
        await ref.set({
            email: String(email).trim().toLowerCase(), role, organizationId: user.organizationId,
            orgName: orgName ?? '', invitedBy: invitedBy ?? '', status: 'pending',
            access: normalizedAccess,
            createdAt: FieldValue.serverTimestamp(), createdBy: user.uid,
        });
        return NextResponse.json({ inviteId: ref.id });
    } catch (error) {
        const status = error instanceof ApiError ? error.status : 400;
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create invitation' }, { status });
    }
}
