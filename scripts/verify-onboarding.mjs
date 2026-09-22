import assert from 'node:assert/strict';
import {
  CURRENCY_OPTIONS,
  DEFAULT_CURRENCY_CODE,
  toCurrencyCode,
  toCurrencySymbol,
} from '../lib/currency.ts';
import {
  BUSINESS_STEP,
  OnboardingError,
  describeInviteFailure,
  toInvitationRow,
  toOrganizationProfileUpdate,
  usableInvites,
} from '../lib/onboarding/mapping.ts';

const FARM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

// ── Currency: a symbol to show, a code to store ──────────────────────────────
// organizations.currency is char(3) with a `currency = upper(currency)` check, so the
// onboarding list's symbols cannot go in as they are: upper('KSh') fails the check
// outright, and '₦' passes it as three bytes that mean nothing to a report.
assert.equal(toCurrencyCode('KSh'), 'KES', 'three characters, but not a code');
assert.equal(toCurrencyCode('₦'), 'NGN');
assert.equal(toCurrencyCode('₵'), 'GHS', 'both cedi options mean the same currency');
assert.equal(toCurrencyCode('GHS'), 'GHS');
assert.equal(toCurrencyCode('UGX'), 'UGX', 'a value that is both symbol and code resolves to itself');
assert.equal(toCurrencyCode('$'), 'USD');
assert.equal(toCurrencyCode('usd'), 'USD');
assert.equal(toCurrencyCode('XOF'), 'XOF', "a code this list does not carry is still a farm's own currency");
assert.equal(toCurrencyCode('Ghana cedi'), DEFAULT_CURRENCY_CODE, 'a label is not a currency');
assert.equal(toCurrencyCode(''), DEFAULT_CURRENCY_CODE);
assert.equal(toCurrencyCode(null), DEFAULT_CURRENCY_CODE);

assert.equal(toCurrencySymbol('NGN'), '₦');
assert.equal(toCurrencySymbol('GHS'), 'GHS', 'the first listed option is the one shown back');
assert.equal(toCurrencySymbol('GHS', '₵'), '₵', 'a farm that picked the cedi sign keeps it');
assert.equal(toCurrencySymbol('XOF'), 'XOF', 'an unlisted code still reads in front of an amount');
assert.equal(toCurrencySymbol(null), 'GHS');

for (const option of CURRENCY_OPTIONS) {
  assert.equal(toCurrencyCode(option.symbol), option.code, `${option.label} must survive the round trip`);
  assert.match(option.code, /^[A-Z]{3}$/, 'every code must satisfy the column check');
}

// ── The business profile ─────────────────────────────────────────────────────
const update = toOrganizationProfileUpdate({
  organizationId: FARM,
  name: '  Kade Farms  ',
  currency: '₵',
  address: '  Eastern Region ',
  phone: '',
  taxId: '   ',
  settings: { agriculture: { operations: ['crop'] } },
});

assert.equal(update.name, 'Kade Farms');
assert.equal(update.currency, 'GHS', 'the column takes the code');
assert.equal(update.settings.currencySymbol, '₵', 'the screen keeps the symbol');
assert.deepEqual(update.settings.agriculture, { operations: ['crop'] }, 'the farm profile is not lost to the currency');
assert.equal(update.address, 'Eastern Region');
assert.equal(update.phone, null, 'a field left blank is stored as nothing, not as an empty string');
assert.equal(update.tax_id, null);
assert.equal(update.onboarding_step, BUSINESS_STEP);
assert.equal('industry' in update, false, 'industry is fixed by a check constraint and is not ours to set');

assert.throws(() => toOrganizationProfileUpdate({ organizationId: FARM, name: ' K ', currency: 'GHS', address: '', phone: '', taxId: '', settings: {} }), OnboardingError,
  'the name column rejects anything shorter than two characters');
assert.throws(() => toOrganizationProfileUpdate({ organizationId: FARM, name: '', currency: 'GHS', address: '', phone: '', taxId: '', settings: {} }), OnboardingError);

// ── Invitations ──────────────────────────────────────────────────────────────
const now = new Date('2026-09-22T10:00:00.000Z');
const invitation = toInvitationRow({
  organizationId: FARM,
  invitedById: OWNER,
  invite: { email: '  Kofi@Kade.Farm ', role: 'worker', access: ['dashboard', 'agricStock'] },
  now,
});

assert.equal(invitation.email, 'kofi@kade.farm', 'the column is case-insensitive; the value should not depend on typing');
assert.equal(invitation.role, 'worker');
assert.deepEqual(invitation.permissions, ['dashboard', 'agricStock']);
assert.equal(invitation.status, 'pending');
assert.equal(invitation.invited_by, OWNER, 'invitations_insert only accepts a row the caller invited');
assert.equal(invitation.expires_at, new Date('2026-10-06T10:00:00.000Z').toISOString(),
  'expires_at has no default, so an invitation with no expiry would be rejected outright');

assert.throws(() => toInvitationRow({ organizationId: FARM, invitedById: OWNER, invite: { email: 'not-an-address', role: 'worker', access: [] } }), OnboardingError);
assert.throws(() => toInvitationRow({ organizationId: FARM, invitedById: OWNER, invite: { email: '', role: 'worker', access: [] } }), OnboardingError);
assert.throws(() => toInvitationRow({ organizationId: FARM, invitedById: OWNER, invite: { email: 'a@b.com', role: 'owner', access: [] } }), OnboardingError,
  'an invitation can never make someone an owner');

// The team step starts with one empty row, and a person who skips it must not produce
// an invitation to nobody.
assert.deepEqual(usableInvites([{ email: '', role: 'worker', access: [] }]), []);
assert.deepEqual(usableInvites([{ email: '   ', role: 'worker', access: [] }]), []);
assert.deepEqual(usableInvites([{ email: 'no-at-sign', role: 'worker', access: [] }]), []);
assert.equal(usableInvites([
  { email: 'a@b.com', role: 'worker', access: [] },
  { email: '', role: 'worker', access: [] },
]).length, 1);

// ── Failures a person can act on ─────────────────────────────────────────────
assert.equal(describeInviteFailure({ code: '23505', message: 'duplicate key value' }),
  'That address already has an invitation waiting.');
assert.equal(describeInviteFailure(new Error('new row violates row-level security policy')),
  'You do not have permission to invite people to this farm.');
assert.equal(describeInviteFailure(new Error('network down')), 'network down',
  'an unmapped failure is reported, never swallowed');

console.log('Onboarding verified (currency codes and symbols, business profile, invitations, skipped rows).');
