import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { ApiError, requireFirebaseUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { normalizeAccess } from '@/lib/access-permissions';
import type { IndustryType } from '@/lib/store';

function generateReferralCode(name: string): string {
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const prefix = name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X') || 'ORG';
    return `${prefix}-${random}`;
}

function dateValue(value: unknown): unknown {
    if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
        return value.toDate().toISOString();
    }
    return value;
}

function organizationPayload(id: string, data: FirebaseFirestore.DocumentData) {
    const subscription = data.subscription ?? {};
    return {
        id,
        name: String(data.name ?? 'Workspace'),
        industry: 'agriculture' as IndustryType,
        ownerId: String(data.ownerId ?? ''),
        referralCode: String(data.referralCode ?? ''),
        subscription: {
            ...subscription,
            trialEndsAt: dateValue(subscription.trialEndsAt),
            currentPeriodEnd: dateValue(subscription.currentPeriodEnd),
        },
        settings: data.settings ?? {},
        currency: data.currency,
        address: data.address,
        phone: data.phone,
        taxId: data.taxId,
    };
}

export async function GET(request: NextRequest) {
    try {
        const user = await requireFirebaseUser(request);
        const [membershipSnapshot, ownedSnapshot] = await Promise.all([
            adminDb.collection('users').doc(user.uid).collection('memberships').limit(100).get(),
            adminDb.collection('organizations').where('ownerId', '==', user.uid).limit(100).get(),
        ]);
        const memberships = new Map<string, { role: 'owner' | 'manager' | 'worker'; access: string[] }>();
        membershipSnapshot.docs.forEach(snapshot => {
            const data = snapshot.data();
            if (data.status === 'inactive' || !['owner', 'manager', 'worker'].includes(data.role)) return;
            memberships.set(snapshot.id, {
                role: data.role,
                access: data.role === 'owner' ? [] : normalizeAccess(data.access ?? [], 'agriculture'),
            });
        });
        ownedSnapshot.docs.forEach(snapshot => memberships.set(snapshot.id, { role: 'owner', access: [] }));
        const ids = Array.from(memberships.keys());
        const organizations = ids.length
            ? await adminDb.getAll(...ids.map(id => adminDb.collection('organizations').doc(id)))
            : [];
        return NextResponse.json({
            memberships: organizations.filter(snapshot => snapshot.exists).map(snapshot => {
                const membership = memberships.get(snapshot.id)!;
                return {
                    organizationId: snapshot.id,
                    organizationName: String(snapshot.data()?.name ?? 'Workspace'),
                    industry: 'agriculture',
                    role: membership.role,
                    access: membership.access,
                };
            }),
        }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
        const status = error instanceof ApiError ? error.status : 400;
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load workspaces' }, { status });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const user = await requireFirebaseUser(request);
        const organizationId = String((await request.json()).organizationId ?? '').trim();
        if (!organizationId) throw new ApiError('Organization is required', 400);

        const userRef = adminDb.collection('users').doc(user.uid);
        const organizationRef = adminDb.collection('organizations').doc(organizationId);
        const membershipRef = userRef.collection('memberships').doc(organizationId);
        const memberRef = organizationRef.collection('members').doc(user.uid);
        const [profileSnapshot, organizationSnapshot, membershipSnapshot, memberSnapshot] = await Promise.all([
            userRef.get(), organizationRef.get(), membershipRef.get(), memberRef.get(),
        ]);
        if (!profileSnapshot.exists) throw new ApiError('User profile not found', 403);
        if (!organizationSnapshot.exists) throw new ApiError('Organization not found', 404);

        const organizationData = organizationSnapshot.data() ?? {};
        const membershipData = membershipSnapshot.exists ? membershipSnapshot.data() : memberSnapshot.data();
        const isOwner = organizationData.ownerId === user.uid;
        if (!isOwner && (!membershipData || membershipData.status === 'inactive' || !['manager', 'worker'].includes(membershipData.role))) {
            throw new ApiError('You are not an active member of this organization', 403);
        }
        const role = isOwner ? 'owner' as const : membershipData!.role as 'manager' | 'worker';
        const access = role === 'owner' ? [] : normalizeAccess(membershipData?.access ?? [], 'agriculture');
        const profile = profileSnapshot.data() ?? {};
        const currentOrganizationId = String(profile.organizationId ?? '');

        const batch = adminDb.batch();
        if (currentOrganizationId && currentOrganizationId !== organizationId) {
            const currentOrganizationSnapshot = await adminDb.collection('organizations').doc(currentOrganizationId).get();
            if (currentOrganizationSnapshot.exists) {
                const currentOrganization = currentOrganizationSnapshot.data() ?? {};
                const currentRole = currentOrganization.ownerId === user.uid ? 'owner' : profile.role;
                if (['owner', 'manager', 'worker'].includes(currentRole)) {
                    batch.set(userRef.collection('memberships').doc(currentOrganizationId), {
                        organizationId: currentOrganizationId,
                        organizationName: currentOrganization.name ?? profile.organizationName ?? 'Workspace',
                        industry: 'agriculture',
                        role: currentRole,
                        access: currentRole === 'owner' ? [] : normalizeAccess(profile.access ?? [], 'agriculture'),
                        status: 'active',
                        updatedAt: FieldValue.serverTimestamp(),
                    }, { merge: true });
                }
            }
        }
        batch.set(membershipRef, {
            organizationId,
            organizationName: organizationData.name ?? 'Workspace',
            industry: 'agriculture', role, access, status: 'active',
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        batch.set(memberRef, {
            uid: user.uid, email: user.email, organizationId,
            organizationName: organizationData.name ?? 'Workspace',
            industry: 'agriculture', role, access, status: 'active',
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        batch.update(userRef, {
            organizationId,
            organizationName: organizationData.name ?? 'Workspace',
            industry: 'agriculture', role, access,
            updatedAt: FieldValue.serverTimestamp(),
        });
        await batch.commit();

        return NextResponse.json({
            organization: organizationPayload(organizationId, organizationData),
            membership: { organizationId, organizationName: organizationData.name ?? 'Workspace', industry: 'agriculture', role, access },
        });
    } catch (error) {
        const status = error instanceof ApiError ? error.status : 400;
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to switch workspace' }, { status });
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await requireFirebaseUser(request);
        const { orgName, referrerCode } = await request.json();
        const industry = 'agriculture';
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
