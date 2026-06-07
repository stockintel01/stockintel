import { NextRequest } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { isSuperAdminEmail } from '@/lib/access-control';

export interface AuthenticatedUser {
    uid: string;
    email: string;
    organizationId: string;
    role: 'super_admin' | 'owner' | 'manager' | 'worker';
}

export class ApiError extends Error {
    constructor(message: string, public status: number) {
        super(message);
    }
}

export async function requireUser(request: NextRequest): Promise<AuthenticatedUser> {
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) {
        throw new ApiError('Authentication required', 401);
    }

    try {
        const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
        if (isSuperAdminEmail(decoded.email)) {
            return {
                uid: decoded.uid,
                email: decoded.email ?? '',
                organizationId: 'system',
                role: 'super_admin',
            };
        }

        const profile = await adminDb.collection('users').doc(decoded.uid).get();
        if (!profile.exists) throw new ApiError('User profile not found', 403);

        const data = profile.data() ?? {};
        return {
            uid: decoded.uid,
            email: decoded.email ?? '',
            organizationId: String(data.organizationId ?? ''),
            role: data.role as AuthenticatedUser['role'],
        };
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError('Invalid or expired authentication token', 401);
    }
}

export function requireRole(user: AuthenticatedUser, roles: AuthenticatedUser['role'][]) {
    if (!roles.includes(user.role)) throw new ApiError('Insufficient permissions', 403);
}
