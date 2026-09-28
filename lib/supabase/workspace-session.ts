'use client';

import type { SupabaseClient } from '@supabase/supabase-js';

import { isSuperAdminEmail } from '@/lib/access-control';
import type { Organization, User as StoreUser } from '@/lib/store';
import { getBrowserSupabaseClient } from './browser';
import {
  activeOrganizationId,
  newOrganizationRow,
  superAdminOrganization,
  toMemberships,
  toStoreOrganization,
  toStoreUser,
  type MembershipRow,
  type OrganizationRow,
  type ProfileRow,
  type SubscriptionRow,
} from './session-mapping';

/**
 * Reads the signed-in member's workspace out of Postgres.
 *
 * Four plain queries rather than an RPC: profiles, organization_memberships,
 * organizations and organization_subscriptions each already carry a policy that
 * returns exactly the caller's own rows, so the database decides what a session can
 * see rather than a function repeating the rule.
 */

// The generated schema types do not exist yet; rows are typed by session-mapping.ts.
function db(): SupabaseClient {
  return getBrowserSupabaseClient() as unknown as SupabaseClient;
}

export interface WorkspaceSession {
  user: StoreUser;
  organization: Organization | null;
  /** True when the account is signed in but belongs to no farm yet. */
  needsWorkspace: boolean;
}

export async function loadWorkspaceSession(identity: { id: string; email: string; name: string; photoURL: string }): Promise<WorkspaceSession> {
  const client = db();
  const isSuperAdmin = isSuperAdminEmail(identity.email);

  const [profileResult, membershipResult] = await Promise.all([
    client.from('profiles')
      .select('id, email, display_name, photo_url, default_organization_id')
      .eq('id', identity.id).maybeSingle(),
    client.from('organization_memberships')
      .select('organization_id, role, permissions, active, organizations(name, industry)')
      .eq('user_id', identity.id).eq('active', true),
  ]);

  if (profileResult.error) throw new Error(profileResult.error.message);
  if (membershipResult.error) throw new Error(membershipResult.error.message);

  // on_auth_user_created writes the profile, but a session can arrive before that
  // commit is visible, so the identity from the token stands in rather than failing.
  const profile: ProfileRow = (profileResult.data as ProfileRow | null) ?? {
    id: identity.id,
    email: identity.email,
    display_name: identity.name,
    photo_url: identity.photoURL || null,
    default_organization_id: null,
  };

  let memberships = toMemberships((membershipResult.data ?? []) as unknown as MembershipRow[]);
  let activeId = activeOrganizationId(profile, memberships);

  if (isSuperAdmin) {
    const { data: organizations, error } = await client.from('organizations')
      .select('id, name, industry')
      .order('name')
      .limit(1000);
    if (error) throw new Error(error.message);
    memberships = [
      {
        organizationId: 'system',
        organizationName: 'StockIntel Platform',
        industry: 'agriculture',
        role: 'super_admin',
        access: [],
      },
      ...(organizations ?? []).map(organization => ({
        organizationId: String(organization.id),
        organizationName: String(organization.name ?? 'Workspace'),
        industry: 'agriculture' as const,
        role: 'super_admin' as const,
        access: [],
      })),
    ];
    activeId = profile.default_organization_id
      && memberships.some(item => item.organizationId === profile.default_organization_id)
      ? profile.default_organization_id
      : 'system';
  }

  const user = toStoreUser({ profile, memberships, activeOrganizationId: activeId, isSuperAdmin });

  if (!activeId || activeId === 'system') {
    return {
      user,
      organization: isSuperAdmin ? superAdminOrganization() : null,
      needsWorkspace: !isSuperAdmin,
    };
  }

  const [organizationResult, subscriptionResult] = await Promise.all([
    client.from('organizations').select('*').eq('id', activeId).maybeSingle(),
    client.from('organization_subscriptions')
      .select('plan_id, status, trial_ends_at, current_period_end')
      .eq('organization_id', activeId).maybeSingle(),
  ]);

  if (organizationResult.error) throw new Error(organizationResult.error.message);
  if (subscriptionResult.error) throw new Error(subscriptionResult.error.message);

  const organizationRow = organizationResult.data as OrganizationRow | null;
  if (!organizationRow) {
    throw new Error('Your active workspace could not be loaded. Ask an administrator to check its membership and database access.');
  }
  const organization = toStoreOrganization(organizationRow, subscriptionResult.data as SubscriptionRow | null);

  return { user, organization, needsWorkspace: false };
}

/**
 * Creates the farm a brand-new account signs in to. One insert is enough:
 * initialize_organization then writes the owner membership, the farm profile, the
 * Sigatoka defaults and a fourteen-day trial.
 *
 * referral_code is unique across every farm, so a collision is retried once with a
 * fresh code rather than surfacing as a failed sign-up.
 */
export async function provisionWorkspace(input: { ownerId: string; name?: string; referrerCode?: string }): Promise<string> {
  const client = db();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await client
      .from('organizations')
      .insert(newOrganizationRow({ ownerId: input.ownerId, name: input.name ?? 'New Business', referrerCode: input.referrerCode }))
      .select('id')
      .single();
    if (!error) return (data as { id: string }).id;
    if (error.code !== '23505' || attempt === 1) throw new Error(error.message);
  }
  throw new Error('A workspace could not be created.');
}
