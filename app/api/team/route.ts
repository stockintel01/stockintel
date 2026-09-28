import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';

import {
    ApiError,
    requireAccess,
    requireActiveSubscription,
    requireRole,
    requireUser,
} from '@/lib/api-auth';
import { normalizeAccess } from '@/lib/access-permissions';
import { adminDb } from '@/lib/firebase-admin';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { isSupabaseBackendActive } from '@/lib/supabase/config';
import { getSupabaseRequestClient } from '@/lib/supabase/request';

interface MemberRow {
    user_id: string;
    role: 'owner' | 'manager' | 'worker';
    permissions: string[] | null;
    active: boolean;
}

function shiftStatus(status: string) {
    if (status === 'on_duty') return 'On Duty';
    if (status === 'completed') return 'Completed';
    if (status === 'cancelled') return 'Cancelled';
    return 'Scheduled';
}

async function getSupabaseTeam(organizationId: string) {
    const client = getSupabaseAdminClient();
    const [membersResult, shiftsResult] = await Promise.all([
        client.from('organization_memberships')
            .select('user_id, role, permissions, active')
            .eq('organization_id', organizationId)
            .eq('active', true)
            .limit(1000),
        client.from('work_shifts')
            .select('id, user_id, user_name, shift_date, start_time, end_time, status')
            .eq('organization_id', organizationId)
            .order('shift_date')
            .order('start_time')
            .limit(1000),
    ]);
    if (membersResult.error) throw new ApiError(membersResult.error.message, 503);
    if (shiftsResult.error) throw new ApiError(shiftsResult.error.message, 503);

    const members = (membersResult.data ?? []) as MemberRow[];
    const ids = members.map(member => member.user_id);
    const { data: profiles, error: profilesError } = ids.length
        ? await client.from('profiles').select('id, display_name, email').in('id', ids)
        : { data: [], error: null };
    if (profilesError) throw new ApiError(profilesError.message, 503);
    const profileById = new Map((profiles ?? []).map(profile => [profile.id, profile]));

    return {
        members: members.map(member => {
            const profile = profileById.get(member.user_id);
            return {
                id: member.user_id,
                name: profile?.display_name || profile?.email?.split('@')[0] || 'Team member',
                email: profile?.email ?? '',
                role: member.role,
                access: member.role === 'owner' ? [] : normalizeAccess(member.permissions ?? [], 'agriculture'),
                status: 'Active',
            };
        }),
        shifts: (shiftsResult.data ?? []).map(shift => ({
            id: shift.id,
            userId: shift.user_id,
            userName: shift.user_name,
            date: shift.shift_date,
            startTime: String(shift.start_time).slice(0, 5),
            endTime: String(shift.end_time).slice(0, 5),
            status: shiftStatus(shift.status),
        })),
    };
}

async function getFirebaseTeam(organizationId: string) {
    const [organization, shifts] = await Promise.all([
        adminDb.collection('organizations').doc(organizationId).collection('members').get(),
        adminDb.collection('organizations').doc(organizationId).collection('shifts').get(),
    ]);
    let memberDocuments = organization.docs;
    if (memberDocuments.length === 0) {
        const legacy = await adminDb.collection('users').where('organizationId', '==', organizationId).get();
        memberDocuments = legacy.docs;
    }
    return {
        members: memberDocuments
            .filter(document => document.data().status !== 'inactive')
            .map(document => {
                const data = document.data();
                return {
                    id: document.id,
                    name: data.displayName || data.name || String(data.email ?? '').split('@')[0] || 'Team member',
                    email: data.email ?? '',
                    role: data.role ?? 'worker',
                    access: Array.isArray(data.access) ? normalizeAccess(data.access, 'agriculture') : [],
                    status: 'Active',
                };
            }),
        shifts: shifts.docs.map(document => ({ id: document.id, ...document.data() })),
    };
}

export async function GET(request: NextRequest) {
    try {
        const user = await requireUser(request);
        requireRole(user, ['owner', 'manager']);
        requireAccess(user, 'team');
        if (!user.organizationId || user.organizationId === 'system') {
            throw new ApiError('Open a farm workspace to manage its team', 400);
        }
        const result = isSupabaseBackendActive()
            ? await getSupabaseTeam(user.organizationId)
            : await getFirebaseTeam(user.organizationId);
        return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
        const status = error instanceof ApiError ? error.status : 400;
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load the team' }, { status });
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await requireUser(request);
        requireActiveSubscription(user);
        requireRole(user, ['owner', 'manager']);
        requireAccess(user, 'team');
        const { userId, date, startTime, endTime } = await request.json();
        if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ''))) {
            throw new ApiError('A team member and valid shift date are required', 400);
        }
        if (!/^\d{2}:\d{2}$/.test(String(startTime ?? '')) || !/^\d{2}:\d{2}$/.test(String(endTime ?? '')) || startTime === endTime) {
            throw new ApiError('Enter a valid start and end time', 400);
        }

        if (isSupabaseBackendActive()) {
            const admin = getSupabaseAdminClient();
            const { data: membership } = await admin.from('organization_memberships')
                .select('user_id, active')
                .eq('organization_id', user.organizationId)
                .eq('user_id', userId)
                .eq('active', true)
                .maybeSingle();
            if (!membership) throw new ApiError('Team member not found', 404);
            const { data: profile } = await admin.from('profiles')
                .select('display_name, email')
                .eq('id', userId)
                .maybeSingle();
            const userName = profile?.display_name || profile?.email?.split('@')[0] || 'Team member';
            const scoped = getSupabaseRequestClient(request);
            const { data, error } = await scoped.from('work_shifts').insert({
                organization_id: user.organizationId,
                user_id: userId,
                user_name: userName,
                shift_date: date,
                start_time: startTime,
                end_time: endTime,
                status: 'scheduled',
                created_by: user.uid,
            }).select('id').single();
            if (error) throw new ApiError(error.message, 400);
            return NextResponse.json({ id: data.id }, { status: 201 });
        }

        const member = await adminDb.collection('organizations').doc(user.organizationId)
            .collection('members').doc(String(userId)).get();
        const legacyMember = member.exists ? null : await adminDb.collection('users').doc(String(userId)).get();
        const memberData = member.exists ? member.data() : legacyMember?.data();
        if (!memberData || (memberData.organizationId && memberData.organizationId !== user.organizationId)) {
            throw new ApiError('Team member not found', 404);
        }
        const shift = await adminDb.collection('organizations').doc(user.organizationId).collection('shifts').add({
            userId,
            userName: memberData.displayName || memberData.name || memberData.email?.split('@')[0] || 'Team member',
            date,
            startTime,
            endTime,
            status: 'Scheduled',
            createdBy: user.uid,
            createdAt: FieldValue.serverTimestamp(),
        });
        return NextResponse.json({ id: shift.id }, { status: 201 });
    } catch (error) {
        const status = error instanceof ApiError ? error.status : 400;
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to assign shift' }, { status });
    }
}
