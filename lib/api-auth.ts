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
        process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 ||
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
        (process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY) ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        process.env.FIREBASE_CONFIG
    );
}

function configuredProjectId() {
    return process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '';
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

export async function requireUser(request: NextRequest): Promise<AuthenticatedUser> {
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
        throw new ApiError('Unable to load your user profile from Firebase. Check Firebase Admin credentials and Firestore access in Vercel.', 503);
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
