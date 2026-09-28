import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { ApiError, requireFirebaseUser, requireSupabaseUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { normalizeAccess } from '@/lib/access-permissions';
import type { IndustryType } from '@/lib/store';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { isSupabaseBackendActive } from '@/lib/supabase/config';
import { getSupabaseRequestClient } from '@/lib/supabase/request';
import { toStoreOrganization, type OrganizationRow, type SubscriptionRow } from '@/lib/supabase/session-mapping';

export async function GET(_request: NextRequest, context: { params: Promise<{ inviteId: string }> }) {
    const { inviteId } = await context.params;
    if (isSupabaseBackendActive()) {
        const client = getSupabaseAdminClient();
        const { data, error } = await client.from('invitations')
            .select('id, email, role, permissions, status, expires_at, organizations(name)')
            .eq('id', inviteId)
            .maybeSingle();
        if (error || !data || data.status !== 'pending' || new Date(data.expires_at).getTime() <= Date.now()) {
            return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
        }
        const organization = data.organizations as unknown as { name?: string } | null;
        return NextResponse.json({
            id: data.id,
            email: data.email,
            role: data.role,
            access: data.permissions ?? [],
            orgName: organization?.name ?? 'Workspace',
            status: data.status,
        }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
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
        if (isSupabaseBackendActive()) {
            await requireSupabaseUser(request);
            const { inviteId } = await context.params;
            const scopedClient = getSupabaseRequestClient(request);
            const { data: organizationId, error } = await scopedClient.rpc('accept_invitation', {
                p_invitation_id: inviteId,
            });
            if (error) {
                const message = error.message.toLowerCase();
                const status = message.includes('another email') ? 403
                    : message.includes('not found') ? 404
                        : message.includes('invalid or expired') ? 409
                            : 400;
                throw new ApiError(error.message, status);
            }

            const admin = getSupabaseAdminClient();
            const identity = await requireSupabaseUser(request);
            const [membershipResult, organizationResult, subscriptionResult] = await Promise.all([
                admin.from('organization_memberships')
                    .select('role, permissions')
                    .eq('organization_id', organizationId)
                    .eq('user_id', identity.uid)
                    .single(),
                admin.from('organizations').select('*').eq('id', organizationId).single(),
                admin.from('organization_subscriptions')
                    .select('plan_id, status, trial_ends_at, current_period_end')
                    .eq('organization_id', organizationId)
                    .maybeSingle(),
            ]);
            if (membershipResult.error || organizationResult.error) {
                throw new ApiError('The invitation was accepted, but the workspace could not be loaded.', 503);
            }
            const role = membershipResult.data.role as 'manager' | 'worker';
            const access = normalizeAccess(membershipResult.data.permissions ?? [], 'agriculture');
            return NextResponse.json({
                organizationId,
                role,
                access,
                organization: toStoreOrganization(
                    organizationResult.data as OrganizationRow,
                    (subscriptionResult.data ?? null) as SubscriptionRow | null,
                ),
            });
        }
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
