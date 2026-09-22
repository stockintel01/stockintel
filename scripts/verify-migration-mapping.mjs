import assert from 'node:assert/strict';
import {
  asNumber,
  asText,
  asTimestamp,
  convertQuantity,
  mapExpenseBudgetRow,
  mapExpenseCategoryRow,
  mapExpenseRow,
  mapInventoryItemRow,
  mapMembershipRow,
  mapOrganizationRow,
  mapSubscriptionUpdate,
  mapUsageLogRow,
  mapWaterRecordRow,
  openingMovementKey,
  referralCodeFor,
  resolveMembershipRole,
  resolveUnitCode,
} from '../lib/migration/firestore-mapping.ts';

// ── Value conversion ─────────────────────────────────────────────────────────
assert.equal(asText('  Kade Farms  '), 'Kade Farms');
assert.equal(asText('   '), null);
assert.equal(asText(42), null);
assert.equal(asText('x'.repeat(20), 5), 'xxxxx');
assert.equal(asNumber('12.5'), 12.5);
assert.equal(asNumber(undefined, 7), 7);
assert.equal(asNumber('not a number'), 0);
assert.equal(asTimestamp('2026-09-16T10:00:00.000Z'), '2026-09-16T10:00:00.000Z');
assert.equal(asTimestamp('nonsense'), null);
assert.equal(asTimestamp(undefined), null);

// ── Units ────────────────────────────────────────────────────────────────────
assert.equal(resolveUnitCode('lt'), 'L');
assert.equal(resolveUnitCode('L'), 'L');
assert.equal(resolveUnitCode('BOXES'), 'box');
assert.equal(resolveUnitCode('units'), 'unit');
assert.equal(resolveUnitCode('drums'), null, 'an unmapped unit must be reported, not guessed');

// ── Organizations ────────────────────────────────────────────────────────────
assert.equal(referralCodeFor({ id: 'org1', data: { referralCode: 'KADE1' } }), 'KADE1');
assert.equal(referralCodeFor({ id: 'abcdefghijklmn', data: {} }), 'ORG-ABCDEFGHIJ', 'a missing code is derived from the document id');

const organizationRow = mapOrganizationRow({
  id: 'org1',
  data: {
    name: '  Kade Farms  ',
    currency: 'ghs',
    address: 'Eastern Region',
    taxId: 'TIN-1',
    settings: { weekStart: 'monday' },
    receiptSettings: 'not an object',
  },
}, 'auth-owner');
assert.equal(organizationRow.legacy_firebase_id, 'org1');
assert.equal(organizationRow.name, 'Kade Farms');
assert.equal(organizationRow.owner_id, 'auth-owner');
assert.equal(organizationRow.currency, 'GHS');
assert.equal(organizationRow.referral_code, 'ORG-ORG1');
assert.deepEqual(organizationRow.settings, { weekStart: 'monday', currencySymbol: 'ghs' },
  'the symbol the farm displays is kept beside the code the column stores');

// organizations.currency is char(3) with an upper-case check, and Firestore holds the
// symbol the onboarding list offered. Truncating it stored a naira sign as a code and
// made upper(KSh) fail the check outright.
assert.equal(mapOrganizationRow({ id: 'o', data: { currency: '₦' } }, 'a').currency, 'NGN');
assert.equal(mapOrganizationRow({ id: 'o', data: { currency: 'KSh' } }, 'a').currency, 'KES');
assert.equal(mapOrganizationRow({ id: 'o', data: { currency: '₵' } }, 'a').currency, 'GHS');
assert.equal(mapOrganizationRow({ id: 'o', data: { currency: '$' } }, 'a').currency, 'USD');
assert.equal(mapOrganizationRow({ id: 'o', data: { currency: 'XOF' } }, 'a').currency, 'XOF',
  'a code this list does not carry is still the farm’s own currency');
assert.equal(mapOrganizationRow({ id: 'o', data: { currency: '₦' } }, 'a').settings.currencySymbol, '₦');
assert.deepEqual(organizationRow.receipt_settings, {}, 'a malformed settings value must not break the insert');
assert.deepEqual(organizationRow.app_branding, {}, 'a farm with no app branding still imports');
assert.deepEqual(
  mapOrganizationRow({ id: 'org3', data: { appBranding: { appName: 'Kade Farms', themeColor: '#0f766e' } } }, 'auth-owner').app_branding,
  { appName: 'Kade Farms', themeColor: '#0f766e' },
  'the installed app identity survives the migration',
);
assert.equal(organizationRow.onboarding_complete, true);
assert.equal(mapOrganizationRow({ id: 'org2', data: {} }, 'auth-owner').name, 'Unnamed farm');
assert.equal(mapOrganizationRow({ id: 'org2', data: {} }, 'auth-owner').currency, 'GHS');

// ── Subscriptions ────────────────────────────────────────────────────────────
assert.deepEqual(mapSubscriptionUpdate({ plan: 'pro', status: 'active', currentPeriodEnd: '2026-12-01T00:00:00.000Z' }), {
  plan_id: 'pro',
  status: 'active',
  trial_ends_at: null,
  current_period_end: '2026-12-01T00:00:00.000Z',
});
assert.equal(mapSubscriptionUpdate({ plan: 'free_trial', status: 'active' }).status, 'trialing');
assert.equal(mapSubscriptionUpdate({ plan: 'pro', status: 'expired' }).status, 'expired');
assert.equal(mapSubscriptionUpdate({ plan: 'pro', status: 'cancelled' }).status, 'cancelled');
assert.equal(mapSubscriptionUpdate({ plan: 'platinum', status: 'active' }).plan_id, 'free_trial', 'an unknown plan falls back rather than failing the insert');
assert.equal(mapSubscriptionUpdate(undefined), null);

// ── Memberships ──────────────────────────────────────────────────────────────
assert.deepEqual(resolveMembershipRole('worker', 'u1', 'u1'), { role: 'owner', demoted: false });
assert.deepEqual(resolveMembershipRole('owner', 'u2', 'u1'), { role: 'manager', demoted: true }, 'only one owner per organization is allowed');
assert.deepEqual(resolveMembershipRole('manager', 'u2', 'u1'), { role: 'manager', demoted: false });
assert.deepEqual(resolveMembershipRole('nonsense', 'u2', 'u1'), { role: 'worker', demoted: false });

const membership = mapMembershipRow({
  organizationId: 'org-uuid',
  userId: 'auth-2',
  uid: 'u2',
  ownerUid: 'u1',
  data: { role: 'worker', access: ['agricStock', 'notARealPermission', 7], status: 'active', jobTitle: 'Stockkeeper' },
});
assert.deepEqual(membership.row.permissions, ['agricStock'], 'unknown permissions are dropped so the enum cast cannot fail');
assert.equal(membership.row.active, true);
assert.equal(membership.row.legacy_firebase_membership_id, 'u2');
assert.equal(mapMembershipRow({ organizationId: 'o', userId: 'a', uid: 'u3', ownerUid: 'u1', data: { status: 'inactive' } }).row.active, false);
assert.deepEqual(mapMembershipRow({ organizationId: 'o', userId: 'a', uid: 'u3', ownerUid: 'u1', data: {} }).row.permissions, []);

// ── Inventory ────────────────────────────────────────────────────────────────
const item = mapInventoryItemRow({
  document: {
    id: 'item1',
    data: {
      name: 'Tilt 250EC',
      category: 'fungicide',
      uom: 'lt',
      currentStock: 2,
      minimumStock: -5,
      reorderAlertDays: 10.7,
      unitCost: 120,
      lastReceivedDate: '2026-08-01T00:00:00.000Z',
      packSize: '1lt',
    },
  },
  organizationId: 'org-uuid',
  stockUnitId: 'unit-uuid',
  createdBy: 'auth-owner',
});
assert.equal(item.legacy_firebase_id, 'item1');
assert.equal(item.category, 'fungicide');
assert.equal(item.minimum_stock, 0, 'a negative minimum would violate the check constraint');
assert.equal(item.reorder_alert_days, 10, 'the column is an integer');
assert.equal(item.last_received_on, '2026-08-01');
assert.equal(item.active, true);
assert.equal(item.archived_at, null);
assert.equal(item.unit_cost, 120);
assert.equal(item.stock_unit_id, 'unit-uuid');

const archived = mapInventoryItemRow({
  document: { id: 'item2', data: { category: 'unknown-category', isActive: false, deletedAt: '2026-07-01T00:00:00.000Z', deletionNote: 'Expired' } },
  organizationId: 'org-uuid',
  stockUnitId: 'unit-uuid',
  createdBy: 'auth-owner',
});
assert.equal(archived.category, 'other', 'an unrecognized category falls back to other');
assert.equal(archived.active, false);
assert.equal(archived.archived_at, '2026-07-01T00:00:00.000Z');
assert.equal(archived.archive_reason, 'Expired');
assert.equal(archived.name, 'Unnamed item');
assert.equal(archived.unit_cost, null);

assert.equal(openingMovementKey('item1'), 'import:opening:item1');

// ── Quantity conversion ──────────────────────────────────────────────────────
assert.equal(convertQuantity(2, 'lt', 'ml'), 2000);
assert.equal(convertQuantity(500, 'g', 'kg'), 0.5);
assert.equal(convertQuantity(3, 'kg', 'kg'), 3);
assert.equal(convertQuantity(4, 'units', 'bags'), 4, 'counted units share one family, as they do in the app');
assert.equal(convertQuantity(1, 'L', 'kg'), null, 'volume cannot become weight');
assert.equal(convertQuantity(1, 'drums', 'L'), null);
assert.equal(convertQuantity(Number.NaN, 'kg', 'g'), null);

// ── Usage logs ───────────────────────────────────────────────────────────────
const usage = mapUsageLogRow({
  document: {
    id: 'log1',
    data: {
      quantity: 2, uom: 'lt', date: '2026-09-01', appliedBy: 'Kwame',
      weekNumber: 36, weekYear: 2026, weekStartDate: '2026-08-31', weekEndDate: '2026-09-06',
      batchNumber: 'B-12', notes: 'Block C',
    },
  },
  organizationId: 'org-uuid',
  itemId: 'item-uuid',
  unitId: 'unit-uuid',
  quantityInStockUnit: 2,
  recordedBy: 'auth-1',
  supervisorId: null,
});
assert.equal(usage.ok, true);
assert.equal(usage.row.applied_at, '2026-09-01T00:00:00.000Z');
assert.equal(usage.row.farm_week, 36);
assert.equal(usage.row.week_end_date, '2026-09-06');
assert.equal(usage.row.applied_by_name, 'Kwame');
assert.equal(usage.row.recorded_by, 'auth-1');

const zeroUsage = mapUsageLogRow({
  document: { id: 'log2', data: { quantity: 0, date: '2026-09-01' } },
  organizationId: 'o', itemId: 'i', unitId: 'u', quantityInStockUnit: 0, recordedBy: 'a', supervisorId: null,
});
assert.equal(zeroUsage.ok, false, 'the column requires a positive quantity');

const undatedUsage = mapUsageLogRow({
  document: { id: 'log3', data: { quantity: 1, date: 'whenever' } },
  organizationId: 'o', itemId: 'i', unitId: 'u', quantityInStockUnit: 1, recordedBy: 'a', supervisorId: null,
});
assert.equal(undatedUsage.ok, false);

const oddWeek = mapUsageLogRow({
  document: { id: 'log4', data: { quantity: 1, date: '2026-09-01', weekNumber: 70, weekStartDate: '2026-09-06', weekEndDate: '2026-08-31' } },
  organizationId: 'o', itemId: 'i', unitId: 'u', quantityInStockUnit: 1, recordedBy: 'a', supervisorId: null,
});
assert.equal(oddWeek.row.farm_week, null, 'a week outside 1-53 would violate the check constraint');
assert.equal(oddWeek.row.week_end_date, null, 'an end before the start would violate the check constraint');

// ── Expenses ─────────────────────────────────────────────────────────────────
const category = mapExpenseCategoryRow({
  document: { id: 'cat1', data: { name: 'Fuel', color: '#ff0000', requiresApproval: true, monthlyLimit: 500 } },
  organizationId: 'org-uuid',
  createdBy: 'auth-1',
});
assert.equal(category.ok, true);
assert.equal(category.row.name, 'Fuel');
assert.equal(category.row.requires_approval, true);
assert.equal(category.row.monthly_limit, 500);
assert.equal(category.row.kind, 'general');
assert.equal(mapExpenseCategoryRow({ document: { id: 'c', data: {} }, organizationId: 'o', createdBy: 'a' }).ok, false);

const budget = mapExpenseBudgetRow({
  document: { id: 'b1', data: { name: 'Q4 fuel', amount: 1000, period: 'weekly', startDate: '2026-10-01', endDate: '2026-12-31', alertThresholdPercent: 140 } },
  organizationId: 'org-uuid', categoryId: 'cat-uuid', currency: 'GHS', createdBy: 'auth-1',
});
assert.equal(budget.row.period, 'custom', 'an unsupported period falls back rather than failing the insert');
assert.equal(budget.row.alert_threshold_percent, 100, 'the threshold is clamped to the check constraint');
assert.equal(budget.row.currency, 'GHS');
assert.equal(mapExpenseBudgetRow({ document: { id: 'b', data: { amount: 0, startDate: '2026-01-01', endDate: '2026-02-01' } }, organizationId: 'o', categoryId: null, currency: 'GHS', createdBy: 'a' }).ok, false);
assert.equal(mapExpenseBudgetRow({ document: { id: 'b', data: { amount: 5, startDate: '2026-03-01', endDate: '2026-01-01' } }, organizationId: 'o', categoryId: null, currency: 'GHS', createdBy: 'a' }).ok, false);

const expense = mapExpenseRow({
  document: { id: 'e1', data: { title: 'Diesel', amount: 250, date: '2026-09-02', paymentMethod: 'mobile_money', status: 'approved', recurring: false, recurrence: 'monthly', receiptUrl: 'https://firebasestorage.googleapis.com/x' } },
  organizationId: 'org-uuid', categoryId: 'cat-uuid', budgetId: null, currency: 'GHS', submittedBy: 'auth-1', approvedBy: 'auth-2',
});
assert.equal(expense.row.recurrence, null, 'a recurrence without recurring would violate the check constraint');
assert.equal(expense.row.status, 'approved');
assert.equal(expense.row.expense_date, '2026-09-02');
assert.equal(expense.row.receipt_storage_path, null, 'a Firebase download URL is not a storage object path');
assert.equal(expense.row.approved_by, 'auth-2');
assert.equal(mapExpenseRow({ document: { id: 'e', data: { amount: 5, date: '2026-09-02', status: 'weird' } }, organizationId: 'o', categoryId: 'c', budgetId: null, currency: 'GHS', submittedBy: 'a', approvedBy: null }).row.status, 'pending');
assert.equal(mapExpenseRow({ document: { id: 'e', data: { amount: -5, date: '2026-09-02' } }, organizationId: 'o', categoryId: 'c', budgetId: null, currency: 'GHS', submittedBy: 'a', approvedBy: null }).ok, false);

// ── Water records ────────────────────────────────────────────────────────────
const water = mapWaterRecordRow({
  document: { id: 'w1', data: { date: '2026-09-03', sectorName: 'Sector A', plotName: 'Plot 7', cropName: 'Banana', rainfallMm: -4, et0Mm: 5, cropCoefficient: 3.4, effectiveRainfallPercent: 150, irrigationEfficiencyPercent: 0, triggerDeficitMm: 0, source: 'import' } },
  organizationId: 'org-uuid',
  createdBy: 'auth-1',
});
assert.equal(water.ok, true);
assert.equal(water.row.record_date, '2026-09-03');
assert.equal(water.row.rainfall_mm, 0, 'a negative rainfall would violate the check constraint');
assert.equal(water.row.crop_coefficient, 2, 'the coefficient is capped at the check constraint');
assert.equal(water.row.effective_rainfall_percent, 100);
assert.equal(water.row.irrigation_efficiency_percent, 0.01, 'the efficiency must stay above zero');
assert.equal(water.row.trigger_deficit_mm, 0.01);
assert.equal(water.row.source, 'import');
assert.equal(mapWaterRecordRow({ document: { id: 'w', data: {} }, organizationId: 'o', createdBy: 'a' }).ok, false);
assert.equal(mapWaterRecordRow({ document: { id: 'w', data: { date: '2026-09-03' } }, organizationId: 'o', createdBy: 'a' }).row.sector_name, 'Unknown sector');

console.log('Firebase to Supabase mapping verified (values, units, organizations, subscriptions, memberships, inventory, usage, expenses, water).');
