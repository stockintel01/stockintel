import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { ApiError, requireAccess, requireFeature, requireRole, requireUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { getPlanLimit } from '@/lib/plans';
import { canDelegateAccess, defaultAccessForRole, normalizeAccess, normalizeAccessForRole } from '@/lib/access-permissions';
import type { IndustryType } from '@/lib/store';

export async function POST(request: NextRequest) {
    try {
        const user = await requireUser(request);
        requireRole(user, ['owner', 'manager']);
        requireAccess(user, 'team');
        requireFeature(user, 'team');
        const { email, role, orgName, invitedBy, access } = await request.json();
        if (!email || !['manager', 'worker'].includes(role)) throw new ApiError('Valid email and role are required', 400);
        const orgSnapshot = await adminDb.collection('organizations').doc(user.organizationId).get();
        if (!orgSnapshot.exists) throw new ApiError('Organization not found', 404);
        const industry = 'agriculture' as IndustryType;
        const requestedAccess = Array.isArray(access) ? access : defaultAccessForRole(role, industry);
        const recognizedAccess = normalizeAccess(requestedAccess, industry);
        if (recognizedAccess.length !== requestedAccess.length) throw new ApiError('One or more access permissions are invalid', 400);
        if (!canDelegateAccess(user, role, recognizedAccess, industry)) {
            throw new ApiError('You cannot grant owner-only access or permissions beyond your own access level', 403);
        }
        const normalizedAccess = normalizeAccessForRole(recognizedAccess, industry, role);

        const [members, pending, configSnapshot] = await Promise.all([
            adminDb.collection('users').where('organizationId', '==', user.organizationId).count().get(),
            adminDb.collection('invitations').where('organizationId', '==', user.organizationId).where('status', '==', 'pending').count().get(),
            adminDb.collection('system').doc('config').get(),
        ]);
        const configuredWorkers = configSnapshot.data()?.features;
        const configuredLimit = user.subscription?.plan === 'free_trial'
            ? configuredWorkers?.maxWorkersFreeTrial
            : user.subscription?.plan === 'pro'
                ? configuredWorkers?.maxWorkersPro
                : user.subscription?.plan === 'enterprise'
                    ? configuredWorkers?.maxWorkersEnterprise
                    : undefined;
        const hasConfiguredLimit = typeof configuredLimit === 'number'
            && Number.isFinite(configuredLimit)
            && configuredLimit >= 1;
        const limit = user.role === 'super_admin'
            ? Number.POSITIVE_INFINITY
            : hasConfiguredLimit
                ? configuredLimit
                : getPlanLimit(user.subscription, 'teamMembers');
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
