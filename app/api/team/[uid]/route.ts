import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { ApiError, requireRole, requireUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { normalizeAccess } from '@/lib/access-permissions';
import type { IndustryType } from '@/lib/store';

export async function PATCH(request: NextRequest, context: { params: Promise<{ uid: string }> }) {
    try {
        const user = await requireUser(request);
        requireRole(user, ['owner', 'manager']);
        const { uid } = await context.params;
        const { role, access } = await request.json();
        if (!['manager', 'worker'].includes(role)) throw new ApiError('Valid role is required', 400);

        const targetRef = adminDb.collection('users').doc(uid);
        const [targetSnapshot, orgSnapshot] = await Promise.all([
            targetRef.get(),
            adminDb.collection('organizations').doc(user.organizationId).get(),
        ]);
        if (!targetSnapshot.exists) throw new ApiError('Team member not found', 404);
        if (!orgSnapshot.exists) throw new ApiError('Organization not found', 404);

        const target = targetSnapshot.data() ?? {};
        if (target.organizationId !== user.organizationId) throw new ApiError('Team member not found', 404);
        if (target.role === 'owner' || target.role === 'super_admin') throw new ApiError('Owner access cannot be changed here', 403);

        const industry = 'agriculture' as IndustryType;
        const normalizedAccess = normalizeAccess(access, industry);
        await targetRef.update({
            role,
            access: normalizedAccess,
            updatedAt: FieldValue.serverTimestamp(),
            accessUpdatedBy: user.uid,
        });
        await Promise.all([
            adminDb.collection('users').doc(uid).collection('memberships').doc(user.organizationId).set({
                role,
                access: normalizedAccess,
                updatedAt: FieldValue.serverTimestamp(),
                accessUpdatedBy: user.uid,
            }, { merge: true }),
            adminDb.collection('organizations').doc(user.organizationId).collection('members').doc(uid).set({
                role,
                access: normalizedAccess,
                updatedAt: FieldValue.serverTimestamp(),
                accessUpdatedBy: user.uid,
            }, { merge: true }),
        ]);

        return NextResponse.json({ uid, role, access: normalizedAccess });
    } catch (error) {
        const status = error instanceof ApiError ? error.status : 400;
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update team member' }, { status });
    }
}
