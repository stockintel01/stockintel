import { NextRequest, NextResponse } from 'next/server';

import { buildMonogramSvg, normalizeAppBranding } from '@/lib/branding/app-branding';
import { readOrganizationBranding } from '@/lib/branding/server/organization-branding';

/**
 * A monogram tile in the farm's own colours, used as the app icon until someone
 * uploads a logo. Drawn as SVG so no image processing is needed at request time.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const organizationId = params.get('org')?.trim() ?? '';
  const record = organizationId ? await readOrganizationBranding(organizationId) : null;
  const branding = record?.branding ?? normalizeAppBranding({});

  return new NextResponse(buildMonogramSvg(branding, params.get('purpose') === 'maskable'), {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
}
