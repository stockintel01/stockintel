import { NextRequest, NextResponse } from 'next/server';

import { ApiError, requireAccess, requireUser } from '@/lib/api-auth';
import { normalizeAppBranding, workspaceStartUrl } from '@/lib/branding/app-branding';
import { readOrganizationBranding, writeOrganizationBranding } from '@/lib/branding/server/organization-branding';

/**
 * A farm's own app settings. The organization always comes from the verified session,
 * never from the request, so one farm can only ever change its own app.
 */
async function requireOrganization(request: NextRequest) {
  const user = await requireUser(request);
  requireAccess(user, 'settings');
  if (user.role === 'super_admin' || !user.organizationId) {
    throw new ApiError('Open a farm workspace to change its app settings', 403);
  }
  return user;
}

function errorResponse(error: unknown) {
  if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error('[branding] App branding request failed:', error);
  return NextResponse.json({ error: 'The app settings could not be saved. Try again shortly.' }, { status: 500 });
}

function payload(organizationId: string, branding: ReturnType<typeof normalizeAppBranding>) {
  return {
    branding,
    manifestUrl: `/api/pwa/manifest?org=${encodeURIComponent(organizationId)}`,
    startUrl: workspaceStartUrl(organizationId),
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireOrganization(request);
    const record = await readOrganizationBranding(user.organizationId);
    return NextResponse.json(payload(user.organizationId, record?.branding ?? normalizeAppBranding({})));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireOrganization(request);
    const record = await readOrganizationBranding(user.organizationId);
    if (!record) throw new ApiError('Organization not found', 404);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') throw new ApiError('App settings are required', 400);

    // Normalizing here is what stops an unusable name, an invalid colour or an icon
    // hosted somewhere else from reaching the manifest.
    const branding = normalizeAppBranding(body, record.organizationName);
    await writeOrganizationBranding(user.organizationId, branding);

    return NextResponse.json(payload(user.organizationId, branding));
  } catch (error) {
    return errorResponse(error);
  }
}
