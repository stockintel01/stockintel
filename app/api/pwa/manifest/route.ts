import { NextRequest, NextResponse } from 'next/server';

import {
  DEFAULT_APP_BRANDING,
  buildTenantManifest,
  normalizeAppBranding,
} from '@/lib/branding/app-branding';
import { readOrganizationBranding } from '@/lib/branding/server/organization-branding';

/**
 * The web app manifest for one farm. The browser fetches this without a session, so
 * it returns only what appears on a home screen: the farm's name, colours and icon.
 *
 * An unknown farm falls back to the platform manifest rather than failing, because a
 * manifest that errors makes the app uninstallable.
 */
export async function GET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get('org')?.trim() ?? '';
  const record = organizationId ? await readOrganizationBranding(organizationId) : null;

  const manifest = record
    ? buildTenantManifest(record.branding, { organizationId })
    : {
      ...buildTenantManifest(normalizeAppBranding({}), { organizationId: 'platform' }),
      id: '/',
      start_url: '/dashboard',
      name: DEFAULT_APP_BRANDING.appName,
      short_name: DEFAULT_APP_BRANDING.shortName,
      icons: [{ src: '/logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
    };

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    },
  });
}
