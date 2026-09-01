import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { ApiError, requireAccess, requireActiveSubscription, requireRole, requireUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { canDelegateAccess, normalizeAccess, normalizeAccessForRole } from '@/lib/access-permissions';
import type { IndustryType } from '@/lib/store';

export async function PATCH(request: NextRequest, context: { params: Promise<{ uid: string }> }) {
    try {
        const user = await requireUser(request);
        requireActiveSubscription(user);
        requireRole(user, ['owner', 'manager']);
        requireAccess(user, 'team');
        const { uid } = await context.params;
        const { role, access } = await request.json();
        if (!['manager', 'worker'].includes(role)) throw new ApiError('Valid role is required', 400);

        const targetRef = adminDb.collection('users').doc(uid);
        const membershipRef = targetRef.collection('memberships').doc(user.organizationId);
        const orgMemberRef = adminDb.collection('organizations').doc(user.organizationId).collection('members').doc(uid);
        const [targetSnapshot, orgSnapshot, membershipSnapshot, orgMemberSnapshot] = await Promise.all([
            targetRef.get(),
            adminDb.collection('organizations').doc(user.organizationId).get(),
            membershipRef.get(),
            orgMemberRef.get(),
        ]);
        if (!targetSnapshot.exists) throw new ApiError('Team member not found', 404);
        if (!orgSnapshot.exists) throw new ApiError('Organization not found', 404);

        const target = targetSnapshot.data() ?? {};
        const tenantMembership = membershipSnapshot.exists
            ? membershipSnapshot.data() ?? {}
            : orgMemberSnapshot.exists
                ? orgMemberSnapshot.data() ?? {}
                : target.organizationId === user.organizationId
                    ? target
                    : null;
        if (!tenantMembership || tenantMembership.status === 'inactive') throw new ApiError('Team member not found', 404);
        if (tenantMembership.role === 'owner' || tenantMembership.role === 'super_admin') throw new ApiError('Owner access cannot be changed here', 403);

        const industry = 'agriculture' as IndustryType;
        if (!Array.isArray(access)) throw new ApiError('Access permissions are required', 400);
        const recognizedAccess = normalizeAccess(access, industry);
        if (recognizedAccess.length !== access.length) throw new ApiError('One or more access permissions are invalid', 400);
        if (!canDelegateAccess(user, role, recognizedAccess, industry)) {
            throw new ApiError('You cannot grant owner-only access or permissions beyond your own access level', 403);
        }
        const normalizedAccess = normalizeAccessForRole(recognizedAccess, industry, role);
        const updates: Array<Promise<unknown>> = [
            membershipRef.set({
                organizationId: user.organizationId,
                role,
                access: normalizedAccess,
                status: 'active',
                updatedAt: FieldValue.serverTimestamp(),
                accessUpdatedBy: user.uid,
            }, { merge: true }),
            orgMemberRef.set({
                uid,
                organizationId: user.organizationId,
                role,
                access: normalizedAccess,
                status: 'active',
                updatedAt: FieldValue.serverTimestamp(),
                accessUpdatedBy: user.uid,
            }, { merge: true }),
        ];
        if (target.organizationId === user.organizationId) {
            updates.push(targetRef.update({
                role,
                access: normalizedAccess,
                updatedAt: FieldValue.serverTimestamp(),
                accessUpdatedBy: user.uid,
            }));
        }
        await Promise.all(updates);

        return NextResponse.json({ uid, role, access: normalizedAccess });
    } catch (error) {
        const status = error instanceof ApiError ? error.status : 400;
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update team member' }, { status });
    }
}
