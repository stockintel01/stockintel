import { NextRequest } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { isSuperAdminEmail } from '@/lib/access-control';
import { canUseFeature, isSubscriptionActive, type PlanFeature, type SubscriptionLike } from '@/lib/plans';

export interface AuthenticatedUser {
    uid: string;
    email: string;
    organizationId: string;
    role: 'super_admin' | 'owner' | 'manager' | 'worker';
    subscription: SubscriptionLike | null;
}

export class ApiError extends Error {
    constructor(message: string, public status: number) {
        super(message);
    }
}

function hasServerCredentialConfig() {
    return !!(
        (process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY) ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        process.env.FIREBASE_CONFIG
    );
}

export async function requireFirebaseUser(request: NextRequest): Promise<{ uid: string; email: string }> {
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) {
        throw new ApiError('Authentication required', 401);
    }

    try {
        const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
        return { uid: decoded.uid, email: decoded.email ?? '' };
    } catch (error) {
        console.error('[api-auth] Firebase token verification failed:', error);
        if (!hasServerCredentialConfig()) {
            throw new ApiError(
                'Firebase Admin credentials are not configured on the server. Add FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY to .env.local or your hosting environment.',
                503,
            );
        }
        throw new ApiError('Invalid or expired authentication token', 401);
    }
}

export async function requireUser(request: NextRequest): Promise<AuthenticatedUser> {
    try {
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
            subscription: organization?.data()?.subscription ?? null,
        };
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError('Invalid or expired authentication token', 401);
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
