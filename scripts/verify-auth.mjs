import assert from 'node:assert/strict';
import {
  activeOrganizationId,
  describeAuthError,
  generateReferralCode,
  newOrganizationRow,
  toMemberships,
  toStoreOrganization,
  toStoreUser,
  toSubscription,
} from '../lib/supabase/session-mapping.ts';
import { isSubscriptionActive } from '../lib/plans.ts';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FARM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_FARM = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const profile = {
  id: USER,
  email: 'ama@kade.farm',
  display_name: 'Ama Mensah',
  photo_url: null,
  default_organization_id: FARM,
};

// ── Memberships ──────────────────────────────────────────────────────────────
const memberships = toMemberships([
  { organization_id: FARM, role: 'manager', permissions: ['dashboard', 'expenses', 'messaging'], active: true, organizations: { name: 'Kade Farms', industry: 'agriculture' } },
  { organization_id: OTHER_FARM, role: 'owner', permissions: [], active: true, organizations: { name: 'Asuom Estate', industry: 'agriculture' } },
  { organization_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', role: 'worker', permissions: ['dashboard'], active: false, organizations: null },
]);

assert.equal(memberships.length, 2, 'a revoked membership is not a workspace');
assert.deepEqual(memberships[0].access, ['dashboard', 'expenses'],
  'app_permission carries messaging values the AccessKey union does not, and they must not leak through');
assert.equal(memberships[0].organizationName, 'Kade Farms', 'the farm name comes from the embedded row');
assert.deepEqual(memberships[1].access, [], 'an owner holds every permission implicitly and stores none');
assert.equal(toMemberships([{ organization_id: FARM, role: 'super_admin', permissions: [], active: true }])[0].role, 'worker',
  'a role the database should never hold falls back to the least privilege, never to owner');

// ── Which workspace opens ────────────────────────────────────────────────────
assert.equal(activeOrganizationId(profile, memberships), FARM, 'the profile default wins');
assert.equal(activeOrganizationId({ ...profile, default_organization_id: null }, memberships), FARM,
  'with no default, the first membership opens');
assert.equal(
  activeOrganizationId({ ...profile, default_organization_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }, memberships),
  FARM,
  'a default the member no longer belongs to must not strand them on an unreadable workspace',
);
assert.equal(activeOrganizationId(profile, []), '', 'an account with no farm has no workspace');

// ── The store user ───────────────────────────────────────────────────────────
const user = toStoreUser({ profile, memberships, activeOrganizationId: FARM, isSuperAdmin: false });
assert.equal(user.id, USER);
assert.equal(user.role, 'manager', 'the role comes from the membership being opened, not from the account');
assert.deepEqual(user.access, ['dashboard', 'expenses']);
assert.equal(user.memberships.length, 2, 'every workspace stays available for switching');
assert.equal(user.photoURL, undefined);

const superAdmin = toStoreUser({ profile, memberships, activeOrganizationId: FARM, isSuperAdmin: true });
assert.equal(superAdmin.role, 'super_admin', 'a platform admin outranks the membership row');

const nameless = toStoreUser({
  profile: { ...profile, display_name: '' }, memberships: [], activeOrganizationId: '', isSuperAdmin: false,
});
assert.equal(nameless.name, 'ama', 'a missing display name falls back to the local part of the address');
assert.equal(nameless.role, 'worker', 'no membership means no privilege');

// ── Subscriptions: five database statuses, three the store knows ─────────────
const future = new Date(Date.now() + 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();

const trial = toSubscription({ plan_id: 'free_trial', status: 'trialing', trial_ends_at: future, current_period_end: future });
assert.equal(trial.status, 'active');
assert.equal(isSubscriptionActive(trial), true, 'a running trial is active');
assert.equal(isSubscriptionActive(toSubscription({ plan_id: 'free_trial', status: 'trialing', trial_ends_at: past, current_period_end: past })), false,
  'an expired trial is not');

const pastDue = toSubscription({ plan_id: 'pro', status: 'past_due', trial_ends_at: null, current_period_end: future });
assert.equal(isSubscriptionActive(pastDue), true, 'a past-due plan keeps the period it was already paid for');
assert.equal(isSubscriptionActive(toSubscription({ plan_id: 'pro', status: 'past_due', trial_ends_at: null, current_period_end: past })), false,
  'and loses access when that period ends, which is the provider grace period rather than an invented one');

assert.equal(toSubscription({ plan_id: 'pro', status: 'cancelled', trial_ends_at: null, current_period_end: future }).status, 'cancelled');
assert.equal(toSubscription({ plan_id: 'pro', status: 'expired', trial_ends_at: null, current_period_end: future }).status, 'expired');
assert.equal(toSubscription({ plan_id: 'nonsense', status: 'active', trial_ends_at: null, current_period_end: future }).plan, 'free_trial',
  'an unknown plan takes the least entitlement, never the most');
assert.equal(isSubscriptionActive(toSubscription(null)), false, 'a farm with no subscription row is not entitled to anything');

// ── The store organization ───────────────────────────────────────────────────
const organization = toStoreOrganization({
  id: FARM, name: 'Kade Farms', owner_id: USER, industry: 'agriculture', referral_code: 'KAD-7Q2Z',
  currency: 'GHS', address: null, phone: '+233201234567', tax_id: null,
  settings: { onboarded: true }, receipt_settings: { footer: 'Thank you' }, app_branding: { appName: 'Kade' },
}, { plan_id: 'pro', status: 'active', trial_ends_at: null, current_period_end: future });

assert.equal(organization.id, FARM);
assert.equal(organization.ownerId, USER);
assert.equal(organization.referralCode, 'KAD-7Q2Z');
assert.equal(organization.currency, 'GHS');
assert.equal(organization.address, undefined, 'a null column is absent, not the string null');
assert.deepEqual(organization.appBranding, { appName: 'Kade' }, 'the farm keeps its own installed app');
assert.equal(organization.subscription.plan, 'pro');
assert.equal(toStoreOrganization({ ...organization, owner_id: USER, referral_code: 'X', currency: null, settings: null, receipt_settings: null, app_branding: null, address: null, phone: null, tax_id: null, industry: 'agriculture' }, null).currency, 'GHS');

// ── Provisioning a brand-new farm ────────────────────────────────────────────
const row = newOrganizationRow({ ownerId: USER, name: '  ', referrerCode: ' KAD-7Q2Z ' });
assert.equal(row.owner_id, USER, 'organizations_insert only accepts a row the caller owns');
assert.equal(row.name, 'New Business', 'the name column rejects blanks');
assert.equal(row.industry, 'agriculture');
assert.match(row.referral_code, /^[A-Z]{3}-[A-Z0-9]{4}$/);
assert.deepEqual(row.settings, { referredByCode: 'KAD-7Q2Z' },
  'Postgres has no referrer column, so the code is kept rather than dropped');
assert.deepEqual(newOrganizationRow({ ownerId: USER, name: 'Kade Farms' }).settings, {});
assert.equal(generateReferralCode('Kade Farms', 'AB12'), 'KAD-AB12');
// Bug-for-bug with the Firestore route: only a wholly empty name reaches the ORG
// fallback, so a numeric one becomes a run of X. Both backends must agree while both
// can issue codes, and the value is unique either way.
assert.equal(generateReferralCode('7', 'AB12'), 'X-AB12');
assert.equal(generateReferralCode('', 'AB12'), 'ORG-AB12');

// ── Errors a person can act on ───────────────────────────────────────────────
assert.equal(describeAuthError(new Error('Invalid login credentials')), 'Invalid email or password.');
assert.equal(describeAuthError(new Error('Email not confirmed')), 'Confirm your email address first. Check your inbox for the link.');
assert.equal(describeAuthError(new Error('User already registered')), 'An account already exists with this email. Sign in instead.');
assert.equal(describeAuthError(new Error('For security purposes, you can only request this after 47 seconds')), 'Too many attempts. Please wait a moment and try again.');
assert.equal(describeAuthError(new Error('Failed to fetch')), 'Network error. Check your connection and try again.');
assert.equal(describeAuthError(new Error('Something unmapped')), 'Something unmapped', 'an unmapped failure is reported, never swallowed');

console.log('Supabase sign-in verified (memberships, workspace choice, roles, subscriptions, provisioning, errors).');
