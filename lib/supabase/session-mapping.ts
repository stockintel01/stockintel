import { normalizeAccess, type AccessKey } from '@/lib/access-permissions';
import { toCurrencySymbol } from '@/lib/currency';
import type { Organization, TenantMembership, User as StoreUser, UserRole } from '@/lib/store';

/**
 * Turns Supabase rows into the workspace session the application already runs on.
 *
 * Free of any Supabase, React or Firebase import so it can be exercised without a
 * database or a browser (`npm run test:auth`). Everything that decides who someone is
 * and what workspace they are in lives here; the providers only fetch the rows.
 */

export interface ProfileRow {
  id: string;
  email: string;
  display_name: string;
  photo_url: string | null;
  default_organization_id: string | null;
}

export interface MembershipRow {
  organization_id: string;
  role: string;
  permissions: string[] | null;
  active: boolean;
  organizations?: { name: string | null; industry: string | null } | null;
}

export interface OrganizationRow {
  id: string;
  name: string;
  owner_id: string;
  industry: string;
  referral_code: string;
  currency: string | null;
  address: string | null;
  phone: string | null;
  tax_id: string | null;
  settings: Record<string, unknown> | null;
  receipt_settings: Record<string, unknown> | null;
  app_branding: Record<string, unknown> | null;
}

export interface SubscriptionRow {
  plan_id: string;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
}

const ROLES: UserRole[] = ['owner', 'manager', 'worker'];

export function superAdminOrganization(): Organization {
  return {
    id: 'system',
    name: 'StockIntel System Preview',
    industry: 'agriculture',
    ownerId: 'system',
    referralCode: 'SYSTEM',
    subscription: {
      plan: 'enterprise',
      status: 'active',
      trialEndsAt: new Date('2099-12-31'),
      currentPeriodEnd: new Date('2099-12-31'),
    },
  };
}

function role(value: string): UserRole {
  return ROLES.includes(value as UserRole) ? (value as UserRole) : 'worker';
}

/**
 * app_permission gained messaging values the AccessKey union does not carry, so the
 * array is filtered rather than cast. An owner holds every permission implicitly and
 * stores none, which normalizeAccess already expects.
 */
function permissions(values: string[] | null, memberRole: UserRole): AccessKey[] {
  if (memberRole === 'owner') return [];
  return normalizeAccess(values ?? [], 'agriculture');
}

export function toMemberships(rows: MembershipRow[]): TenantMembership[] {
  return rows
    .filter(row => row.active)
    .map(row => {
      const memberRole = role(row.role);
      return {
        organizationId: row.organization_id,
        organizationName: row.organizations?.name ?? undefined,
        industry: 'agriculture' as const,
        role: memberRole,
        access: permissions(row.permissions, memberRole),
      };
    });
}

/**
 * Which workspace opens. The profile's default wins when the member still belongs to
 * it, so removing someone from a farm cannot strand them on a workspace they can no
 * longer read.
 */
export function activeOrganizationId(profile: ProfileRow, memberships: TenantMembership[]): string {
  const preferred = profile.default_organization_id;
  if (preferred && memberships.some(item => item.organizationId === preferred)) return preferred;
  return memberships[0]?.organizationId ?? '';
}

export function toStoreUser(input: {
  profile: ProfileRow;
  memberships: TenantMembership[];
  activeOrganizationId: string;
  isSuperAdmin: boolean;
}): StoreUser {
  const active = input.memberships.find(item => item.organizationId === input.activeOrganizationId);
  return {
    id: input.profile.id,
    name: input.profile.display_name || input.profile.email.split('@')[0] || 'User',
    email: input.profile.email,
    photoURL: input.profile.photo_url ?? undefined,
    organizationId: input.activeOrganizationId,
    role: input.isSuperAdmin ? 'super_admin' : (active?.role ?? 'worker'),
    access: active?.access ?? [],
    memberships: input.memberships,
  };
}

/**
 * The store's three statuses are narrower than the database's five.
 *
 * A trial is active until it runs out, and a past-due subscription stays active until
 * the period it was paid for ends — isSubscriptionActive checks the end date, so the
 * grace period is exactly the one the payment provider granted rather than an extra
 * one invented here.
 */
export function toSubscription(row: SubscriptionRow | null): Organization['subscription'] {
  if (!row) {
    return { plan: 'free_trial', status: 'expired', trialEndsAt: new Date(0).toISOString() };
  }
  const plan = row.plan_id === 'pro' || row.plan_id === 'enterprise' ? row.plan_id : 'free_trial';
  const status = row.status === 'cancelled' ? 'cancelled'
    : row.status === 'expired' ? 'expired'
      : 'active';
  return {
    plan,
    status,
    trialEndsAt: row.trial_ends_at ?? new Date(0).toISOString(),
    currentPeriodEnd: row.current_period_end ?? undefined,
  };
}

export function toStoreOrganization(row: OrganizationRow, subscription: SubscriptionRow | null): Organization {
  return {
    id: row.id,
    name: row.name,
    industry: 'agriculture',
    ownerId: row.owner_id,
    referralCode: row.referral_code,
    subscription: toSubscription(subscription),
    settings: row.settings ?? {},
    // The column holds an ISO code and the whole UI prints a symbol, so the symbol the
    // farm actually picked is preferred over the canonical one for its code.
    currency: toCurrencySymbol(row.currency, typeof row.settings?.currencySymbol === 'string' ? row.settings.currencySymbol : null),
    address: row.address ?? undefined,
    phone: row.phone ?? undefined,
    taxId: row.tax_id ?? undefined,
    receiptSettings: row.receipt_settings ?? undefined,
    appBranding: row.app_branding ?? undefined,
  };
}

/** Matches the format the Firestore route generates, so both backends read alike. */
export function generateReferralCode(name: string, random = Math.random().toString(36).substring(2, 6).toUpperCase()): string {
  const prefix = name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X') || 'ORG';
  return `${prefix}-${random}`;
}

/**
 * The row that provisions a farm. Inserting it fires initialize_organization, which
 * creates the owner membership, the farm profile, the Sigatoka defaults and a
 * fourteen-day trial, so nothing else has to be written here.
 *
 * A referrer is kept in settings because Postgres has no column for one: the Firestore
 * route awards the referring farm a credit, and that has no Supabase equivalent yet.
 */
export function newOrganizationRow(input: { ownerId: string; name: string; referrerCode?: string }) {
  const name = input.name.trim() || 'New Business';
  return {
    name,
    owner_id: input.ownerId,
    industry: 'agriculture',
    referral_code: generateReferralCode(name),
    settings: input.referrerCode?.trim() ? { referredByCode: input.referrerCode.trim() } : {},
  };
}

/** Supabase reports sign-in failures as prose; these are the ones a person can act on. */
export function describeAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials')) return 'Invalid email or password.';
  if (lower.includes('email not confirmed')) return 'Confirm your email address first. Check your inbox for the link.';
  if (lower.includes('user already registered') || lower.includes('already been registered')) {
    return 'An account already exists with this email. Sign in instead.';
  }
  if (lower.includes('password should be at least')) return 'Password must be at least 8 characters.';
  if (lower.includes('unable to validate email address') || lower.includes('invalid email')) {
    return 'Please enter a valid email address.';
  }
  if (lower.includes('for security purposes') || lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (lower.includes('provider is not enabled')) return 'That sign-in method is not enabled for this project.';
  if (lower.includes('failed to fetch') || lower.includes('networkerror')) {
    return 'Network error. Check your connection and try again.';
  }
  return message || 'Something went wrong. Please try again.';
}
