'use client';

import type { SupabaseClient } from '@supabase/supabase-js';

import { getBrowserSupabaseClient } from '@/lib/supabase/browser';
import {
  FINAL_STEP,
  OnboardingError,
  describeInviteFailure,
  toInvitationRow,
  toOrganizationProfileUpdate,
  usableInvites,
  type BusinessProfile,
  type InviteOutcome,
  type OnboardingService,
} from './mapping';

/**
 * The same three onboarding writes against Postgres.
 *
 * All three go through policies the farm's owner already satisfies: organizations_update
 * needs the `settings` permission, which an owner holds implicitly, and
 * invitations_insert needs an active subscription, which the fourteen-day trial created
 * with the farm provides.
 *
 * Invitations are inserted one at a time on purpose. A single statement would be
 * rejected whole when one address already has an invitation waiting, and the person
 * would be told nothing about which of them it was.
 */

// The generated schema types do not exist yet; rows are typed by mapping.ts.
function db(): SupabaseClient {
  return getBrowserSupabaseClient() as unknown as SupabaseClient;
}

export const supabaseOnboarding: OnboardingService = {
  async saveBusinessProfile(profile: BusinessProfile) {
    const { error } = await db()
      .from('organizations')
      .update(toOrganizationProfileUpdate(profile))
      .eq('id', profile.organizationId);
    if (error) {
      throw new OnboardingError(
        /row-level security/i.test(error.message)
          ? 'You do not have permission to change this farm.'
          : error.message,
      );
    }
  },

  async inviteTeammates({ organizationId, invitedById, invites }) {
    const outcome: InviteOutcome = { sent: 0, failures: [] };
    const client = db();

    for (const invite of usableInvites(invites)) {
      const address = invite.email.trim();
      try {
        const { error } = await client
          .from('invitations')
          .insert(toInvitationRow({ organizationId, invitedById, invite }));
        if (error) throw error;
        outcome.sent += 1;
      } catch (error) {
        outcome.failures.push({ email: address, reason: describeInviteFailure(error) });
      }
    }
    return outcome;
  },

  async completeOnboarding(organizationId: string) {
    const { error } = await db()
      .from('organizations')
      .update({ onboarding_complete: true, onboarding_step: FINAL_STEP })
      .eq('id', organizationId);
    if (error) throw new OnboardingError(error.message);
  },
};
