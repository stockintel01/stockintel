import type { AccessKey } from '@/lib/access-permissions';
import { toCurrencyCode } from '@/lib/currency';

/**
 * The rows onboarding writes, and the conversions that make them acceptable to
 * Postgres. No Supabase or React import, so `npm run test:onboarding` covers them.
 */

export interface BusinessProfile {
  organizationId: string;
  name: string;
  /** The symbol the person picked from the list, not an ISO code. */
  currency: string;
  address: string;
  phone: string;
  taxId: string;
  settings: Record<string, unknown>;
}

export interface TeamInvite {
  email: string;
  role: 'manager' | 'worker';
  access: AccessKey[];
}

export interface InviteOutcome {
  sent: number;
  failures: { email: string; reason: string }[];
}

export interface OnboardingService {
  saveBusinessProfile(profile: BusinessProfile): Promise<void>;
  inviteTeammates(input: {
    organizationId: string;
    organizationName: string;
    invitedById: string;
    invitedByName?: string;
    invites: TeamInvite[];
  }): Promise<InviteOutcome>;
  completeOnboarding(organizationId: string): Promise<void>;
}

export class OnboardingError extends Error {}

/** onboarding_step is an integer here and a label in Firestore; both mean this step. */
export const BUSINESS_STEP = 2;
export const FINAL_STEP = 4;
const INVITATION_DAYS = 14;

function text(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

export function toOrganizationProfileUpdate(profile: BusinessProfile) {
  const name = text(profile.name);
  if (!name || name.length < 2) throw new OnboardingError('A business name of at least two characters is required.');

  const symbol = text(profile.currency);
  return {
    name,
    currency: toCurrencyCode(profile.currency),
    address: text(profile.address),
    phone: text(profile.phone),
    tax_id: text(profile.taxId),
    settings: {
      ...profile.settings,
      // The column takes a code and every screen prints a symbol, so the chosen one is
      // kept rather than resolved back to whichever symbol is canonical for the code.
      ...(symbol ? { currencySymbol: symbol } : {}),
    },
    onboarding_step: BUSINESS_STEP,
  };
}

export function toInvitationRow(input: {
  organizationId: string;
  invitedById: string;
  invite: TeamInvite;
  now?: Date;
}) {
  const email = text(input.invite.email)?.toLowerCase();
  if (!email || !email.includes('@')) throw new OnboardingError('A valid email address is required.');
  if (input.invite.role !== 'manager' && input.invite.role !== 'worker') {
    throw new OnboardingError('An invitation can only be for a manager or a worker.');
  }

  const now = input.now ?? new Date();
  return {
    organization_id: input.organizationId,
    email,
    role: input.invite.role,
    permissions: input.invite.access ?? [],
    status: 'pending' as const,
    // expires_at has no default, so an invitation with no expiry would be rejected.
    expires_at: new Date(now.getTime() + INVITATION_DAYS * 86_400_000).toISOString(),
    invited_by: input.invitedById,
  };
}

/** Only the invitations a person typed something into are worth sending. */
export function usableInvites(invites: TeamInvite[]): TeamInvite[] {
  return invites.filter(invite => {
    const email = (invite.email ?? '').trim();
    return email.length > 0 && email.includes('@');
  });
}

export function describeInviteFailure(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  const message = error instanceof Error ? error.message : String(error ?? '');
  // One pending invitation per address per farm, enforced by a partial unique index.
  if (code === '23505' || /duplicate key|already exists/i.test(message)) {
    return 'That address already has an invitation waiting.';
  }
  if (code === '42501' || /row-level security/i.test(message)) {
    return 'You do not have permission to invite people to this farm.';
  }
  return message || 'The invitation could not be created.';
}
