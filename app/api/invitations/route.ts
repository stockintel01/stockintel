import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { ApiError, requireAccess, requireFeature, requireRole, requireUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { getPlanLimit } from '@/lib/plans';
import { canDelegateAccess, defaultAccessForRole, normalizeAccess, normalizeAccessForRole } from '@/lib/access-permissions';
import type { IndustryType } from '@/lib/store';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { isSupabaseBackendActive } from '@/lib/supabase/config';

async function createSupabaseInvitation(input: {
    user: Awaited<ReturnType<typeof requireUser>>;
    email: unknown;
    role: 'manager' | 'worker';
    access: string[];
}) {
    const client = getSupabaseAdminClient();
    const normalizedEmail = String(input.email ?? '').trim().toLowerCase();
    const [organizationResult, memberResult, pendingResult, subscriptionResult] = await Promise.all([
        client.from('organizations').select('name').eq('id', input.user.organizationId).maybeSingle(),
        client.from('organization_memberships')
            .select('user_id', { count: 'exact', head: true })
            .eq('organization_id', input.user.organizationId)
            .eq('active', true),
        client.from('invitations')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', input.user.organizationId)
            .eq('status', 'pending')
            .gt('expires_at', new Date().toISOString()),
        client.from('organization_subscriptions')
            .select('plan_id, override_limits')
            .eq('organization_id', input.user.organizationId)
            .maybeSingle(),
    ]);
    if (organizationResult.error || !organizationResult.data) throw new ApiError('Organization not found', 404);
    if (memberResult.error) throw new ApiError(memberResult.error.message, 503);
    if (pendingResult.error) throw new ApiError(pendingResult.error.message, 503);

    if (subscriptionResult.error || !subscriptionResult.data) throw new ApiError('Subscription not found', 404);
    const { data: entitlement, error: entitlementError } = await client.from('plan_entitlements')
        .select('limit_value')
        .eq('plan_id', subscriptionResult.data.plan_id)
        .eq('feature_key', 'team_members')
        .maybeSingle();
    if (entitlementError) throw new ApiError(entitlementError.message, 503);
    const overrideLimits = subscriptionResult.data.override_limits as Record<string, unknown> | null;
    const override = Number(overrideLimits?.team_members);
    const configuredLimit = Number.isFinite(override) && override >= 0
        ? override
        : entitlement?.limit_value;
    const limit = input.user.role === 'super_admin'
        ? Number.POSITIVE_INFINITY
        : typeof configuredLimit === 'number'
            ? configuredLimit
            : getPlanLimit(input.user.subscription, 'teamMembers');
    if ((memberResult.count ?? 0) + (pendingResult.count ?? 0) >= limit) {
        throw new ApiError(`Your plan allows up to ${limit} team members`, 403);
    }

    const expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + 14);
    const { data, error } = await client.from('invitations').insert({
        organization_id: input.user.organizationId,
        email: normalizedEmail,
        role: input.role,
        permissions: input.access,
        status: 'pending',
        expires_at: expiresAt.toISOString(),
        invited_by: input.user.uid,
    }).select('id').single();
    if (error) {
        if (error.code === '23505') throw new ApiError('A pending invitation already exists for this email address', 409);
        throw new ApiError(error.message, 400);
    }
    return NextResponse.json({ inviteId: data.id, organizationName: organizationResult.data.name });
}

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

        if (isSupabaseBackendActive()) {
            return await createSupabaseInvitation({
                user,
                email,
                role,
                access: normalizedAccess,
            });
        }

        const [legacyMembers, tenantMembers, pending, configSnapshot] = await Promise.all([
            adminDb.collection('users').where('organizationId', '==', user.organizationId).count().get(),
            adminDb.collection('organizations').doc(user.organizationId).collection('members').count().get(),
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
        const activeMemberCount = Math.max(legacyMembers.data().count, tenantMembers.data().count);
        if (activeMemberCount + pending.data().count >= limit) throw new ApiError(`Your plan allows up to ${limit} team members`, 403);

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
