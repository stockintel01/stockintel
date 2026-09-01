import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { ApiError, requireFirebaseUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { normalizeAccess } from '@/lib/access-permissions';
import type { IndustryType } from '@/lib/store';

export async function GET(_request: NextRequest, context: { params: Promise<{ inviteId: string }> }) {
    const { inviteId } = await context.params;
    const snapshot = await adminDb.collection('invitations').doc(inviteId).get();
    if (!snapshot.exists || snapshot.data()?.status !== 'pending') {
        return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    const invite = snapshot.data() ?? {};
    return NextResponse.json({
        id: snapshot.id,
        email: invite.email,
        role: invite.role,
        access: invite.access ?? [],
        orgName: invite.orgName,
        status: invite.status,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest, context: { params: Promise<{ inviteId: string }> }) {
    try {
        const user = await requireFirebaseUser(request);
        const { inviteId } = await context.params;
        const inviteRef = adminDb.collection('invitations').doc(inviteId);
        const userRef = adminDb.collection('users').doc(user.uid);

        const result = await adminDb.runTransaction(async transaction => {
            const inviteSnapshot = await transaction.get(inviteRef);
            if (!inviteSnapshot.exists) throw new ApiError('Invitation not found', 404);

            const invite = inviteSnapshot.data() ?? {};
            if (invite.status !== 'pending') throw new ApiError('Invitation has already been used', 409);
            if (!user.email || user.email.toLowerCase() !== String(invite.email).toLowerCase()) {
                throw new ApiError('Sign in with the invited email address', 403);
            }
            if (!['manager', 'worker'].includes(invite.role)) throw new ApiError('Invalid invitation role', 400);
            const userSnapshot = await transaction.get(userRef);
            const existingProfile = userSnapshot.data() ?? {};
            const orgSnapshot = await transaction.get(adminDb.collection('organizations').doc(String(invite.organizationId)));
            if (!orgSnapshot.exists) throw new ApiError('Inviting organization not found', 404);
            const org = orgSnapshot.data() ?? {};
            const previousOrganizationId = String(existingProfile.organizationId ?? '');
            const previousOrganizationSnapshot = previousOrganizationId && previousOrganizationId !== invite.organizationId
                ? await transaction.get(adminDb.collection('organizations').doc(previousOrganizationId))
                : null;
            const industry = 'agriculture' as IndustryType;
            const access = normalizeAccess(invite.access ?? [], industry);

            if (previousOrganizationSnapshot?.exists) {
                const previousOrganization = previousOrganizationSnapshot.data() ?? {};
                const previousRole = previousOrganization.ownerId === user.uid ? 'owner' : existingProfile.role;
                if (['owner', 'manager', 'worker'].includes(previousRole)) {
                    transaction.set(userRef.collection('memberships').doc(previousOrganizationId), {
                        organizationId: previousOrganizationId,
                        organizationName: previousOrganization.name ?? existingProfile.organizationName ?? 'Workspace',
                        industry,
                        role: previousRole,
                        access: previousRole === 'owner' ? [] : normalizeAccess(existingProfile.access ?? [], industry),
                        status: 'active',
                        updatedAt: FieldValue.serverTimestamp(),
                    }, { merge: true });
                }
            }

            transaction.set(userRef, {
                uid: user.uid,
                email: user.email,
                displayName: existingProfile.displayName ?? user.email.split('@')[0],
                organizationId: invite.organizationId,
                organizationName: org.name ?? invite.orgName ?? 'Your Team',
                industry,
                role: invite.role,
                access,
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
            transaction.set(userRef.collection('memberships').doc(String(invite.organizationId)), {
                uid: user.uid,
                email: user.email,
                organizationId: invite.organizationId,
                organizationName: org.name ?? invite.orgName ?? 'Your Team',
                industry,
                role: invite.role,
                access,
                status: 'active',
                acceptedInviteId: inviteId,
                joinedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
            transaction.set(adminDb.collection('organizations').doc(String(invite.organizationId)).collection('members').doc(user.uid), {
                uid: user.uid,
                email: user.email,
                displayName: existingProfile.displayName ?? user.email.split('@')[0],
                organizationId: invite.organizationId,
                organizationName: org.name ?? invite.orgName ?? 'Your Team',
                industry,
                role: invite.role,
                access,
                status: 'active',
                acceptedInviteId: inviteId,
                joinedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
            transaction.update(inviteRef, {
                status: 'accepted',
                acceptedAt: FieldValue.serverTimestamp(),
                acceptedByUid: user.uid,
            });

            return {
                organizationId: invite.organizationId,
                role: invite.role,
                access,
                organization: {
                    id: invite.organizationId,
                    name: org.name ?? invite.orgName ?? 'Your Team',
                    industry: 'agriculture',
                    ownerId: org.ownerId ?? '',
                    referralCode: org.referralCode ?? '',
                    subscription: org.subscription ?? { plan: 'free_trial', status: 'active' },
                },
            };
        });

        return NextResponse.json(result);
    } catch (error) {
        const status = error instanceof ApiError ? error.status : 400;
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to accept invitation' }, { status });
    }
}
