import { NextRequest } from 'next/server';
import { adminAuth, adminDb, adminProjectId } from '@/lib/firebase-admin';
import { isSuperAdminEmail } from '@/lib/access-control';
import { canUseFeature, isSubscriptionActive, type PlanFeature, type SubscriptionLike } from '@/lib/plans';
import { userHasAccess, type AccessKey } from '@/lib/access-permissions';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { isSupabaseBackendActive } from '@/lib/supabase/config';
import {
    activeOrganizationId,
    toMemberships,
    toSubscription,
    type MembershipRow,
    type ProfileRow,
    type SubscriptionRow,
} from '@/lib/supabase/session-mapping';

export interface AuthenticatedUser {
    uid: string;
    email: string;
    organizationId: string;
    role: 'super_admin' | 'owner' | 'manager' | 'worker';
    access?: AccessKey[];
    subscription: SubscriptionLike | null;
}

export class ApiError extends Error {
    constructor(message: string, public status: number) {
        super(message);
    }
}

function hasServerCredentialConfig() {
    return !!(
        process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 ||
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
        (process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY) ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        process.env.FIREBASE_CONFIG
    );
}

function configuredProjectId() {
    return adminProjectId();
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
        const payload = token.split('.')[1];
        if (!payload) return null;
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
        return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
    } catch {
        return null;
    }
}

function firebaseErrorCode(error: unknown) {
    return typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
}

function firebaseErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : '';
}

function adminCredentialErrorMessage() {
    return process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || process.env.FIREBASE_SERVICE_ACCOUNT_JSON
        ? 'Firebase Admin service account is invalid on the server. Check FIREBASE_SERVICE_ACCOUNT_BASE64 or FIREBASE_SERVICE_ACCOUNT_JSON in Vercel.'
        : 'Firebase Admin credentials are invalid on the server. Check FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY in Vercel.';
}

export async function requireFirebaseUser(request: NextRequest): Promise<{ uid: string; email: string }> {
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) {
        throw new ApiError('Authentication required', 401);
    }

    // A Supabase session carries a token Firebase cannot read. The few routes still on
    // this path write Firestore anyway, so say which one is unported rather than
    // failing as an invalid token.
    if (isSupabaseBackendActive()) {
        throw new ApiError('This endpoint has not been moved to Supabase yet.', 501);
    }

    const token = authorization.slice(7);
    try {
        const decoded = await adminAuth.verifyIdToken(token);
        return { uid: decoded.uid, email: decoded.email ?? '' };
    } catch (error) {
        console.error('[api-auth] Firebase token verification failed:', error);
        if (!hasServerCredentialConfig()) {
            throw new ApiError(
                'Firebase Admin credentials are not configured on the server. Add FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY to .env.local or your hosting environment.',
                503,
            );
        }
        const code = firebaseErrorCode(error);
        const message = firebaseErrorMessage(error);
        const payload = decodeJwtPayload(token);
        const tokenProject = typeof payload?.aud === 'string' ? payload.aud : '';
        const projectId = configuredProjectId();

        if (code.startsWith('app/') || message.includes('Failed to parse private key') || message.includes('DECODER routines')) {
            throw new ApiError(
                adminCredentialErrorMessage(),
                503,
            );
        }

        if (tokenProject && projectId && tokenProject !== projectId) {
            throw new ApiError(
                `Firebase project mismatch. The browser signed in to "${tokenProject}", but the server is configured for "${projectId}". Update the Vercel Firebase public/Admin environment variables so they use the same project.`,
                503,
            );
        }

        if (code === 'auth/id-token-expired') {
            throw new ApiError('Your login session expired. Sign out and sign in again.', 401);
        }

        if (code === 'auth/argument-error' || code === 'auth/invalid-id-token') {
            throw new ApiError('The browser sent an invalid Firebase login token. Sign out, clear the site session if needed, and sign in again.', 401);
        }

        throw new ApiError('Invalid or expired authentication token', 401);
    }
}

function bearerToken(request: NextRequest): string {
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) throw new ApiError('Authentication required', 401);
    return authorization.slice(7);
}

/**
 * Validates a Supabase access token. The secret key is used only to ask the Auth
 * server who the token belongs to; it never lends its own privileges to the caller.
 */
export async function requireSupabaseUser(request: NextRequest): Promise<{ uid: string; email: string }> {
    const token = bearerToken(request);
    let client: ReturnType<typeof getSupabaseAdminClient>;
    try {
        client = getSupabaseAdminClient();
    } catch {
        throw new ApiError(
            'Supabase is not configured on the server. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY to the deployment environment.',
            503,
        );
    }

    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) {
        if (error?.message?.toLowerCase().includes('expired')) {
            throw new ApiError('Your login session expired. Sign out and sign in again.', 401);
        }
        throw new ApiError('Invalid or expired authentication token', 401);
    }
    return { uid: data.user.id, email: data.user.email ?? '' };
}

/**
 * The workspace a Supabase session acts in. Read with the service role rather than the
 * caller's token on purpose: this is the decision about what the caller is allowed to
 * do, so it must not be filtered by the policies it is about to authorise.
 */
async function requireSupabaseWorkspaceUser(request: NextRequest): Promise<AuthenticatedUser> {
    const decoded = await requireSupabaseUser(request);
    if (isSuperAdminEmail(decoded.email)) {
        const client = getSupabaseAdminClient();
        const { data: profile, error } = await client.from('profiles')
            .select('default_organization_id')
            .eq('id', decoded.uid)
            .maybeSingle();
        if (error) throw new ApiError('Unable to load the active superadmin workspace.', 503);
        return {
            uid: decoded.uid,
            email: decoded.email,
            organizationId: String(profile?.default_organization_id ?? 'system'),
            role: 'super_admin',
            subscription: { plan: 'enterprise', status: 'active' },
        };
    }

    const client = getSupabaseAdminClient();
    const [profileResult, membershipResult] = await Promise.all([
        client.from('profiles').select('id, email, display_name, photo_url, default_organization_id')
            .eq('id', decoded.uid).maybeSingle(),
        client.from('organization_memberships').select('organization_id, role, permissions, active')
            .eq('user_id', decoded.uid).eq('active', true),
    ]);

    if (profileResult.error) {
        console.error('[api-auth] Supabase profile load failed:', profileResult.error);
        throw new ApiError('Unable to load your user profile.', 503);
    }
    if (!profileResult.data) throw new ApiError('User profile not found', 403);

    const memberships = toMemberships((membershipResult.data ?? []) as unknown as MembershipRow[]);
    const organizationId = activeOrganizationId(profileResult.data as unknown as ProfileRow, memberships);
    const membership = memberships.find(item => item.organizationId === organizationId);

    if (!organizationId || !membership) {
        return {
            uid: decoded.uid,
            email: decoded.email,
            organizationId: '',
            role: 'owner',
            access: [],
            subscription: null,
        };
    }

    const { data: subscription } = await client.from('organization_subscriptions')
        .select('plan_id, status, trial_ends_at, current_period_end')
        .eq('organization_id', organizationId).maybeSingle();

    return {
        uid: decoded.uid,
        email: decoded.email,
        organizationId,
        role: membership.role,
        access: membership.access,
        subscription: toSubscription((subscription ?? null) as SubscriptionRow | null),
    };
}

export async function requireUser(request: NextRequest): Promise<AuthenticatedUser> {
    if (isSupabaseBackendActive()) return requireSupabaseWorkspaceUser(request);

    const decoded = await requireFirebaseUser(request);
    if (isSuperAdminEmail(decoded.email)) {
        return {
            uid: decoded.uid,
            email: decoded.email ?? '',
            organizationId: 'system',
            role: 'super_admin',
            subscription: { plan: 'enterprise', status: 'active' },
        };
    }

    try {
        const profile = await adminDb.collection('users').doc(decoded.uid).get();
        if (!profile.exists) throw new ApiError('User profile not found', 403);

        const data = profile.data() ?? {};
        const organizationId = String(data.organizationId ?? '');
        const organization = organizationId
            ? await adminDb.collection('organizations').doc(organizationId).get()
            : null;
        return {
            uid: decoded.uid,
            email: decoded.email ?? '',
            organizationId,
            role: data.role as AuthenticatedUser['role'],
            access: Array.isArray(data.access) ? data.access : undefined,
            subscription: organization?.data()?.subscription ?? null,
        };
    } catch (error) {
        if (error instanceof ApiError) throw error;
        console.error('[api-auth] User profile load failed:', error);
        const code = firebaseErrorCode(error);
        const message = firebaseErrorMessage(error);
        if (code.startsWith('app/') || message.includes('Failed to parse private key') || message.includes('DECODER routines')) {
            throw new ApiError(adminCredentialErrorMessage(), 503);
        }
        if (code === 'permission-denied' || code === '7') {
            throw new ApiError(`Firebase Admin can verify login tokens, but Firestore denied reading user profiles in project "${configuredProjectId()}". Check that Firestore is enabled and the service account belongs to this Firebase project.`, 503);
        }
        if (code === 'not-found' || code === '5' || message.toLowerCase().includes('database') || message.toLowerCase().includes('not found')) {
            throw new ApiError(`Firebase Admin can verify login tokens, but Firestore could not find the default database in project "${configuredProjectId()}". Enable Firestore in Firebase Console or confirm the service account project is correct.`, 503);
        }
        throw new ApiError(`Unable to load your user profile from Firebase project "${configuredProjectId()}": ${message || code || 'unknown Firestore error'}`, 503);
    }
}

export function requireActiveSubscription(user: AuthenticatedUser) {
    if (user.role !== 'super_admin' && !isSubscriptionActive(user.subscription)) {
        throw new ApiError('An active subscription is required', 402);
    }
}

export function requireFeature(user: AuthenticatedUser, feature: PlanFeature) {
    if (!canUseFeature(user.subscription, feature, user.role === 'super_admin')) {
        throw new ApiError(`Your current plan does not include ${feature}`, 403);
    }
}

export function requireRole(user: AuthenticatedUser, roles: AuthenticatedUser['role'][]) {
    if (user.role === 'super_admin') return;
    if (!roles.includes(user.role)) throw new ApiError('Insufficient permissions', 403);
}

export function requireAccess(user: AuthenticatedUser, access: AccessKey) {
    if (!userHasAccess(user, access)) throw new ApiError('Insufficient permissions', 403);
}
