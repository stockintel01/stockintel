'use client';

import { authenticatedFetch } from '@/lib/api-client';
import type { Organization, TenantMembership } from '@/lib/store';

/**
 * Makes one organization the caller's active workspace. Used both by the sidebar
 * switcher and when an installed app opens with its own workspace in the start URL.
 *
 * The server re-checks membership, so a workspace in a URL cannot grant access.
 */
export async function activateWorkspace(organizationId: string): Promise<{
  organization: Organization;
  membership: TenantMembership;
}> {
  const response = await authenticatedFetch('/api/organizations', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ organizationId }),
  });
  const result = await response.json() as { organization?: Organization; membership?: TenantMembership; error?: string };
  if (!response.ok || !result.organization || !result.membership) {
    throw new Error(result.error ?? 'The workspace could not be activated.');
  }
  return { organization: result.organization, membership: result.membership };
}
