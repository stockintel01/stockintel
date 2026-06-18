import { NextRequest, NextResponse } from 'next/server';
import { ApiError, requireFirebaseUser } from '@/lib/api-auth';
import { isSuperAdminEmail } from '@/lib/access-control';
import { adminDb, adminProjectId } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
    try {
        const user = await requireFirebaseUser(request);
        if (!isSuperAdminEmail(user.email)) throw new ApiError('Super admin access required', 403);

        const usersProbe = await adminDb.collection('users').limit(1).get();
        return NextResponse.json({
            ok: true,
            projectId: adminProjectId(),
            canReadUsers: true,
            userCountProbe: usersProbe.size,
        });
    } catch (error) {
        const status = error instanceof ApiError ? error.status : 503;
        return NextResponse.json({
            ok: false,
            projectId: adminProjectId(),
            error: error instanceof Error ? error.message : 'Firebase health check failed',
        }, { status });
    }
}
