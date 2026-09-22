import { toCurrencyCode } from '@/lib/currency';

/**
 * Pure mapping from exported Firestore documents to Supabase rows, kept separate from
 * scripts/import-supabase.mjs so the conversions can be tested without a database.
 */

export interface FirestoreDocument {
  id: string;
  data: Record<string, unknown>;
}

export type MembershipRole = 'owner' | 'manager' | 'worker';

// Firestore unit codes mapped onto the seeded global units_of_measure codes.
export const UNIT_CODES: Record<string, string> = {
  lt: 'L', l: 'L', ml: 'ml', g: 'g', kg: 'kg',
  units: 'unit', unit: 'unit', bags: 'bag', bag: 'bag', boxes: 'box', box: 'box',
};

export const INVENTORY_CATEGORIES = new Set([
  'fungicide', 'insecticide', 'herbicide', 'fertilizer',
  'equipment', 'seed', 'feed', 'vaccine', 'packaging', 'produce', 'other',
]);

export const PERMISSIONS = new Set([
  'dashboard', 'expenses', 'team', 'rewards', 'billing', 'settings',
  'agricStock', 'agricRequests', 'agricUsage', 'agricPlanner', 'agricEquipment',
  'agricPacking', 'agricReports', 'agricWeather', 'agricLivestock', 'agricCrops', 'agricSigatoka',
  'messaging', 'messagingAdmin',
]);

export function asText(value: unknown, maxLength = 500): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : null;
}

export function asNumber(value: unknown, fallback = 0): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function asTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function optionalAmount(value: unknown): number | null {
  return value === undefined || value === null ? null : Math.max(asNumber(value), 0);
}

export function resolveUnitCode(uom: unknown): string | null {
  return UNIT_CODES[String(uom ?? '').toLowerCase()] ?? null;
}

/** Referral codes are globally unique and not null, so an organization without one gets a derived code. */
export function referralCodeFor(document: FirestoreDocument): string {
  return asText(document.data.referralCode, 40) ?? `ORG-${document.id.slice(0, 10).toUpperCase()}`;
}

export function mapOrganizationRow(document: FirestoreDocument, ownerAuthId: string): Record<string, unknown> {
  const data = document.data;
  return {
    legacy_firebase_id: document.id,
    name: asText(data.name, 180) ?? 'Unnamed farm',
    owner_id: ownerAuthId,
    industry: 'agriculture',
    referral_code: referralCodeFor(document),
    // Firestore stores the symbol the onboarding list offered, and this column is a
    // char(3) ISO code with an upper-case check. Truncating the symbol passed the
    // check for the naira and failed it for KSh, so the code is resolved properly and
    // the original symbol is kept for display.
    currency: toCurrencyCode(asText(data.currency, 8)),
    address: asText(data.address),
    phone: asText(data.phone, 40),
    tax_id: asText(data.taxId, 60),
    settings: {
      ...(data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings) ? data.settings : {}),
      ...(asText(data.currency, 8) ? { currencySymbol: asText(data.currency, 8) } : {}),
    },
    receipt_settings: data.receiptSettings && typeof data.receiptSettings === 'object' ? data.receiptSettings : {},
    // Carried across so a farm keeps its installed app's name, colours and icon.
    app_branding: data.appBranding && typeof data.appBranding === 'object' && !Array.isArray(data.appBranding)
      ? data.appBranding
      : {},
    onboarding_complete: true,
  };
}

/**
 * Creating an organization also creates a 14-day trial subscription, so the imported
 * plan is applied as an update afterwards.
 */
export function mapSubscriptionUpdate(subscription: unknown): {
  plan_id: string;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
} | null {
  if (!subscription || typeof subscription !== 'object') return null;
  const source = subscription as Record<string, unknown>;
  const plan = ['free_trial', 'pro', 'enterprise'].includes(String(source.plan)) ? String(source.plan) : 'free_trial';
  const status = source.status === 'active'
    ? (plan === 'free_trial' ? 'trialing' : 'active')
    : source.status === 'cancelled' ? 'cancelled' : 'expired';

  return {
    plan_id: plan,
    status,
    trial_ends_at: asTimestamp(source.trialEndsAt),
    current_period_end: asTimestamp(source.currentPeriodEnd),
  };
}

/**
 * A unique index allows one active owner per organization. The organization's own
 * ownerId wins; anyone else recorded as an owner in Firestore becomes a manager.
 */
export function resolveMembershipRole(role: unknown, uid: string, ownerUid: unknown): { role: MembershipRole; demoted: boolean } {
  if (uid === ownerUid) return { role: 'owner', demoted: false };
  if (role === 'owner') return { role: 'manager', demoted: true };
  return { role: role === 'manager' || role === 'worker' ? role : 'worker', demoted: false };
}

export function mapMembershipRow(input: {
  organizationId: string;
  userId: string;
  uid: string;
  ownerUid: unknown;
  data: Record<string, unknown>;
}): { row: Record<string, unknown>; demoted: boolean } {
  const { role, demoted } = resolveMembershipRole(input.data.role, input.uid, input.ownerUid);
  return {
    demoted,
    row: {
      organization_id: input.organizationId,
      user_id: input.userId,
      legacy_firebase_membership_id: input.uid,
      role,
      permissions: Array.isArray(input.data.access)
        ? input.data.access.filter((key): key is string => typeof key === 'string' && PERMISSIONS.has(key))
        : [],
      job_title: asText(input.data.jobTitle, 120),
      active: input.data.status !== 'inactive',
    },
  };
}

export function mapInventoryItemRow(input: {
  document: FirestoreDocument;
  organizationId: string;
  stockUnitId: string;
  createdBy: string;
}): Record<string, unknown> {
  const data = input.document.data;
  return {
    legacy_firebase_id: input.document.id,
    organization_id: input.organizationId,
    name: asText(data.name, 200) ?? 'Unnamed item',
    chemical_component: asText(data.chemicalComponent, 200),
    category: INVENTORY_CATEGORIES.has(String(data.category)) ? String(data.category) : 'other',
    stock_unit_id: input.stockUnitId,
    pack_description: asText(data.packSize, 120),
    minimum_stock: Math.max(asNumber(data.minimumStock), 0),
    reorder_alert_days: Math.max(Math.trunc(asNumber(data.reorderAlertDays, 7)), 0),
    supplier_name: asText(data.supplierName, 200),
    unit_cost: optionalAmount(data.unitCost),
    storage_location: asText(data.location, 200),
    average_weekly_usage: optionalAmount(data.avgWeeklyUsage),
    last_received_on: asTimestamp(data.lastReceivedDate)?.slice(0, 10) ?? null,
    last_received_quantity: optionalAmount(data.lastReceivedQty),
    active: data.isActive !== false,
    archived_at: asTimestamp(data.deletedAt),
    archive_reason: asText(data.deletionNote),
    created_by: input.createdBy,
  };
}

/** Opening balances are keyed so a re-run cannot count the same stock twice. */
export function openingMovementKey(legacyItemId: string): string {
  return `import:opening:${legacyItemId}`;
}

// ---------------------------------------------------------------------------
// Quantities
// ---------------------------------------------------------------------------

// The same factors lib/agric/units.ts uses, so an imported quantity matches what the
// application calculated. Counted units share one family and convert one to one.
const UNIT_FAMILIES: Record<string, { family: 'volume' | 'weight' | 'count'; factor: number }> = {
  ml: { family: 'volume', factor: 1 },
  lt: { family: 'volume', factor: 1000 },
  l: { family: 'volume', factor: 1000 },
  g: { family: 'weight', factor: 1 },
  kg: { family: 'weight', factor: 1000 },
  units: { family: 'count', factor: 1 },
  bags: { family: 'count', factor: 1 },
  boxes: { family: 'count', factor: 1 },
};

/** Returns null when the units belong to different families, which the caller reports. */
export function convertQuantity(quantity: number, fromUom: unknown, toUom: unknown): number | null {
  const from = UNIT_FAMILIES[String(fromUom ?? '').toLowerCase()];
  const to = UNIT_FAMILIES[String(toUom ?? '').toLowerCase()];
  if (!from || !to || from.family !== to.family || !Number.isFinite(quantity)) return null;
  const converted = (quantity * from.factor) / to.factor;
  return Number.isFinite(converted) ? Number(converted.toFixed(6)) : null;
}

export type MapResult =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; error: string };

function clamp(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const number = asNumber(value, fallback);
  return Math.min(Math.max(number, minimum), maximum);
}

function dateOnly(value: unknown): string | null {
  return asTimestamp(value)?.slice(0, 10) ?? null;
}

// ---------------------------------------------------------------------------
// Usage logs
// ---------------------------------------------------------------------------

/**
 * Usage logs import as history only. Balances come from the Firestore snapshot rather
 * than from replaying movements, so a log never moves stock a second time.
 */
export function mapUsageLogRow(input: {
  document: FirestoreDocument;
  organizationId: string;
  itemId: string;
  unitId: string;
  quantityInStockUnit: number;
  recordedBy: string;
  supervisorId: string | null;
}): MapResult {
  const data = input.document.data;
  const quantity = asNumber(data.quantity);
  if (quantity <= 0) return { ok: false, error: 'quantity must be greater than zero' };
  if (input.quantityInStockUnit <= 0) return { ok: false, error: 'converted quantity must be greater than zero' };

  const appliedAt = asTimestamp(data.date);
  if (!appliedAt) return { ok: false, error: `date "${String(data.date)}" is not a valid date` };

  const week = asNumber(data.weekNumber, 0);
  const weekStart = dateOnly(data.weekStartDate);
  const weekEnd = dateOnly(data.weekEndDate);
  const orderedWeek = weekStart && weekEnd && weekEnd < weekStart ? null : weekEnd;

  return {
    ok: true,
    row: {
      legacy_firebase_id: input.document.id,
      organization_id: input.organizationId,
      item_id: input.itemId,
      applied_at: appliedAt,
      quantity,
      unit_id: input.unitId,
      quantity_in_stock_unit: input.quantityInStockUnit,
      applied_by_name: asText(data.appliedBy, 200) ?? 'Unknown',
      supervisor_id: input.supervisorId,
      batch_number: asText(data.batchNumber, 120),
      notes: asText(data.notes),
      farm_week: week >= 1 && week <= 53 ? Math.trunc(week) : null,
      farm_week_year: Number.isFinite(asNumber(data.weekYear, Number.NaN)) ? Math.trunc(asNumber(data.weekYear)) : null,
      week_start_date: weekStart,
      week_end_date: orderedWeek,
      recorded_by: input.recordedBy,
    },
  };
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export function mapExpenseCategoryRow(input: {
  document: FirestoreDocument;
  organizationId: string;
  createdBy: string;
}): MapResult {
  const data = input.document.data;
  const name = asText(data.name, 200);
  if (!name) return { ok: false, error: 'a category needs a name' };

  return {
    ok: true,
    row: {
      legacy_firebase_id: input.document.id,
      organization_id: input.organizationId,
      name,
      description: asText(data.description),
      color: asText(data.color, 40) ?? '#64748b',
      kind: asText(data.kind, 60) ?? 'general',
      active: data.isActive !== false,
      requires_approval: data.requiresApproval === true,
      monthly_limit: optionalAmount(data.monthlyLimit),
      created_by: input.createdBy,
    },
  };
}

export function mapExpenseBudgetRow(input: {
  document: FirestoreDocument;
  organizationId: string;
  categoryId: string | null;
  currency: string;
  createdBy: string;
}): MapResult {
  const data = input.document.data;
  const amount = asNumber(data.amount);
  if (amount <= 0) return { ok: false, error: 'a budget amount must be greater than zero' };

  const startDate = dateOnly(data.startDate);
  const endDate = dateOnly(data.endDate);
  if (!startDate || !endDate) return { ok: false, error: 'a budget needs a start and an end date' };
  if (endDate < startDate) return { ok: false, error: 'the budget ends before it starts' };

  return {
    ok: true,
    row: {
      legacy_firebase_id: input.document.id,
      organization_id: input.organizationId,
      category_id: input.categoryId,
      name: asText(data.name, 200) ?? 'Unnamed budget',
      amount,
      currency: input.currency,
      period: ['monthly', 'quarterly', 'annual', 'custom'].includes(String(data.period)) ? String(data.period) : 'custom',
      start_date: startDate,
      end_date: endDate,
      alert_threshold_percent: clamp(data.alertThresholdPercent, 0, 100, 80),
      active: data.isActive !== false,
      notes: asText(data.notes),
      created_by: input.createdBy,
    },
  };
}

/**
 * receipt_storage_path stays null: Firestore holds a Firebase Storage download URL,
 * and the column expects an object path in the expense-receipts bucket. Writing the
 * URL there would produce receipts that look attached but cannot be opened.
 */
export function mapExpenseRow(input: {
  document: FirestoreDocument;
  organizationId: string;
  categoryId: string;
  budgetId: string | null;
  currency: string;
  submittedBy: string;
  approvedBy: string | null;
}): MapResult {
  const data = input.document.data;
  const amount = asNumber(data.amount);
  if (amount <= 0) return { ok: false, error: 'an expense amount must be greater than zero' };

  const expenseDate = dateOnly(data.date);
  if (!expenseDate) return { ok: false, error: `date "${String(data.date)}" is not a valid date` };

  const recurring = data.recurring === true;
  const recurrence = recurring && ['weekly', 'monthly', 'quarterly', 'annual'].includes(String(data.recurrence))
    ? String(data.recurrence)
    : null;

  return {
    ok: true,
    row: {
      legacy_firebase_id: input.document.id,
      organization_id: input.organizationId,
      category_id: input.categoryId,
      budget_id: input.budgetId,
      title: asText(data.title, 200) ?? 'Untitled expense',
      amount,
      currency: input.currency,
      expense_date: expenseDate,
      vendor: asText(data.vendor, 200),
      payment_method: asText(data.paymentMethod, 40) ?? 'other',
      status: ['pending', 'approved', 'paid', 'rejected', 'void'].includes(String(data.status)) ? String(data.status) : 'pending',
      recurring,
      recurrence,
      cost_center: asText(data.costCenter, 120),
      reference: asText(data.reference, 200),
      receipt_storage_path: null,
      notes: asText(data.notes),
      submitted_by: input.submittedBy,
      approved_by: input.approvedBy,
    },
  };
}

// ---------------------------------------------------------------------------
// Water records
// ---------------------------------------------------------------------------

export function mapWaterRecordRow(input: {
  document: FirestoreDocument;
  organizationId: string;
  createdBy: string;
}): MapResult {
  const data = input.document.data;
  const recordDate = dateOnly(data.date);
  if (!recordDate) return { ok: false, error: `date "${String(data.date)}" is not a valid date` };

  return {
    ok: true,
    row: {
      legacy_firebase_id: input.document.id,
      organization_id: input.organizationId,
      sector_name: asText(data.sectorName, 200) ?? 'Unknown sector',
      plot_name: asText(data.plotName, 200) ?? 'Unknown plot',
      crop_name: asText(data.cropName, 200) ?? 'Unknown crop',
      record_date: recordDate,
      rainfall_mm: Math.max(asNumber(data.rainfallMm), 0),
      et0_mm: Math.max(asNumber(data.et0Mm), 0),
      crop_coefficient: clamp(data.cropCoefficient, 0.01, 2, 1),
      irrigation_mm: Math.max(asNumber(data.irrigationMm), 0),
      effective_rainfall_percent: clamp(data.effectiveRainfallPercent, 0, 100, 80),
      irrigation_efficiency_percent: clamp(data.irrigationEfficiencyPercent, 0.01, 100, 85),
      trigger_deficit_mm: Math.max(asNumber(data.triggerDeficitMm, 25), 0.01),
      source: data.source === 'import' ? 'import' : 'manual',
      notes: asText(data.notes),
      created_by: input.createdBy,
    },
  };
}
