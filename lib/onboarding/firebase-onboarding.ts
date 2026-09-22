'use client';

import { doc, updateDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase';
import { inviteMember } from '@/lib/firebase-utils';
import {
  describeInviteFailure,
  usableInvites,
  type BusinessProfile,
  type InviteOutcome,
  type OnboardingService,
  type TeamInvite,
} from './mapping';

/**
 * The Firestore onboarding writes, moved out of the page unchanged. The organization
 * document keeps the currency symbol and a label for the step it reached, which is
 * what every Firestore-backed screen already reads.
 */
export const firebaseOnboarding: OnboardingService = {
  async saveBusinessProfile(profile: BusinessProfile) {
    await updateDoc(doc(db, 'organizations', profile.organizationId), {
      name: profile.name,
      industry: 'agriculture',
      currency: profile.currency,
      address: profile.address,
      phone: profile.phone,
      taxId: profile.taxId,
      settings: profile.settings,
      onboardingStep: 'business_complete',
    });
  },

  async inviteTeammates({ organizationId, organizationName, invitedByName, invites }) {
    const outcome: InviteOutcome = { sent: 0, failures: [] };
    await Promise.all(usableInvites(invites).map(async (invite: TeamInvite) => {
      try {
        await inviteMember(invite.email.trim(), invite.role, organizationId, organizationName, invitedByName, invite.access);
        outcome.sent += 1;
      } catch (error) {
        outcome.failures.push({ email: invite.email.trim(), reason: describeInviteFailure(error) });
      }
    }));
    return outcome;
  },

  async completeOnboarding(organizationId: string) {
    await updateDoc(doc(db, 'organizations', organizationId), { onboardingComplete: true });
  },
};
