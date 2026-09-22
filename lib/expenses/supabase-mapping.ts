import { toCurrencyCode } from '@/lib/currency';
import type {
  ExpenseBudget,
  ExpenseBudgetPeriod,
  ExpenseCategory,
  ExpensePaymentMethod,
  ExpenseRecord,
  ExpenseStatus,
} from './types';

/**
 * Row shapes and conversions for the Supabase expense ledger.
 *
 * Kept free of any Supabase or React import so the conversions can be exercised
 * without a database or a browser (`npm run test:expenses`). Everything that decides
 * what reaches Postgres lives here; lib/expenses/supabase-expenses.ts only moves it.
 *
 * Three differences from the Firestore documents are deliberate:
 *
 *  - Names are not stored. Firestore denormalises categoryName, budgetName and
 *    submittedByName onto each document, where they go stale when a category is
 *    renamed. Postgres keeps the identifier and the reader joins the name back on.
 *  - Clearing a field clears it. The Firestore writer drops empty strings, so
 *    emptying the vendor box left the old vendor in place; here it writes null.
 *  - A voided expense reads as rejected. public.expense_status carries a fifth value
 *    the application never writes and the ledger has no badge for; both mean the
 *    money is not owed.
 */

export interface ExpenseCategoryRow {
  id: string;
  name: string;
  description: string | null;
  color: string;
  kind: string;
  active: boolean;
  requires_approval: boolean;
  monthly_limit: number | string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseBudgetRow {
  id: string;
  category_id: string | null;
  name: string;
  amount: number | string;
  period: string;
  start_date: string;
  end_date: string;
  alert_threshold_percent: number | string;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseRow {
  id: string;
  category_id: string;
  budget_id: string | null;
  title: string;
  amount: number | string;
  expense_date: string;
  vendor: string | null;
  payment_method: string;
  status: string;
  recurring: boolean;
  recurrence: string | null;
  cost_center: string | null;
  reference: string | null;
  receipt_storage_path: string | null;
  notes: string | null;
  submitted_by: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

/** What a reader needs to put the names back onto a row. */
export interface ExpenseLookups {
  categoryName: (id: string) => string | undefined;
  budgetName: (id: string) => string | undefined;
  memberName: (id: string) => string | undefined;
  receiptUrl?: (storagePath: string) => string | undefined;
}

export const UNKNOWN_MEMBER = 'A team member';

const PAYMENT_METHODS: ExpensePaymentMethod[] = ['cash', 'card', 'bank_transfer', 'mobile_money', 'credit', 'other'];
const PERIODS: ExpenseBudgetPeriod[] = ['monthly', 'quarterly', 'annual', 'custom'];
const RECURRENCES = ['weekly', 'monthly', 'quarterly', 'annual'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function amount(value: number | string | null | undefined): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 0;
}

function optionalText(value: string | null | undefined): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text === '' ? undefined : text;
}

/** null clears the column; the caller decides whether the column is written at all. */
function writableText(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text === '' ? null : text;
}

function readStatus(value: string): ExpenseStatus {
  if (value === 'approved' || value === 'paid' || value === 'rejected') return value;
  if (value === 'void') return 'rejected';
  return 'pending';
}

function readPaymentMethod(value: string): ExpensePaymentMethod {
  return PAYMENT_METHODS.includes(value as ExpensePaymentMethod) ? (value as ExpensePaymentMethod) : 'other';
}

function readPeriod(value: string): ExpenseBudgetPeriod {
  return PERIODS.includes(value as ExpenseBudgetPeriod) ? (value as ExpenseBudgetPeriod) : 'custom';
}

// ---------------------------------------------------------------------------
// Rows to records
// ---------------------------------------------------------------------------

export function toExpenseCategory(row: ExpenseCategoryRow): ExpenseCategory {
  return {
    id: row.id,
    name: row.name,
    description: optionalText(row.description),
    color: row.color,
    kind: row.kind,
    isActive: row.active,
    requiresApproval: row.requires_approval,
    monthlyLimit: row.monthly_limit === null ? undefined : amount(row.monthly_limit),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toExpenseBudget(row: ExpenseBudgetRow, lookups: Pick<ExpenseLookups, 'categoryName'>): ExpenseBudget {
  return {
    id: row.id,
    name: row.name,
    amount: amount(row.amount),
    period: readPeriod(row.period),
    startDate: row.start_date,
    endDate: row.end_date,
    categoryId: row.category_id ?? undefined,
    categoryName: row.category_id ? lookups.categoryName(row.category_id) : undefined,
    alertThresholdPercent: amount(row.alert_threshold_percent),
    isActive: row.active,
    notes: optionalText(row.notes),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toExpenseRecord(row: ExpenseRow, lookups: ExpenseLookups): ExpenseRecord {
  const recurrence = RECURRENCES.find(item => item === row.recurrence);
  return {
    id: row.id,
    title: row.title,
    amount: amount(row.amount),
    categoryId: row.category_id,
    // An expense cannot exist without its category, so a blank name here means the
    // categories have not arrived yet rather than that the category is gone.
    categoryName: lookups.categoryName(row.category_id) ?? '',
    date: row.expense_date,
    vendor: optionalText(row.vendor),
    paymentMethod: readPaymentMethod(row.payment_method),
    status: readStatus(row.status),
    budgetId: row.budget_id ?? undefined,
    budgetName: row.budget_id ? lookups.budgetName(row.budget_id) : undefined,
    recurring: row.recurring,
    recurrence: row.recurring ? recurrence : undefined,
    costCenter: optionalText(row.cost_center),
    reference: optionalText(row.reference),
    receiptUrl: row.receipt_storage_path ? lookups.receiptUrl?.(row.receipt_storage_path) : undefined,
    notes: optionalText(row.notes),
    submittedById: row.submitted_by,
    submittedByName: lookups.memberName(row.submitted_by) ?? UNKNOWN_MEMBER,
    approvedById: row.approved_by ?? undefined,
    approvedByName: row.approved_by ? (lookups.memberName(row.approved_by) ?? UNKNOWN_MEMBER) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Records to rows
// ---------------------------------------------------------------------------

export interface WriteContext {
  organizationId: string;
  actorId: string;
  currency: string;
}

export class ExpenseWriteError extends Error {}

/** Postgres identities are uuids; a Firestore document id here would be silent corruption. */
function requireUuid(value: string | undefined, subject: string): string {
  if (!value || !UUID.test(value)) {
    throw new ExpenseWriteError(`${subject} is not a Supabase identifier.`);
  }
  return value;
}

export function toCategoryInsert(data: Omit<ExpenseCategory, 'id'>, context: WriteContext) {
  const name = writableText(data.name);
  if (!name) throw new ExpenseWriteError('A category needs a name.');
  return {
    organization_id: requireUuid(context.organizationId, 'The farm'),
    name,
    description: writableText(data.description),
    color: writableText(data.color) ?? '#64748b',
    kind: writableText(data.kind) ?? 'general',
    active: data.isActive !== false,
    requires_approval: data.requiresApproval === true,
    monthly_limit: typeof data.monthlyLimit === 'number' && data.monthlyLimit > 0 ? data.monthlyLimit : null,
    created_by: requireUuid(context.actorId, 'The signed-in account'),
  };
}

export function toCategoryUpdate(patch: Partial<ExpenseCategory>) {
  const row: Record<string, unknown> = {};
  if ('name' in patch) {
    const name = writableText(patch.name);
    if (!name) throw new ExpenseWriteError('A category needs a name.');
    row.name = name;
  }
  if ('description' in patch) row.description = writableText(patch.description);
  if ('color' in patch) row.color = writableText(patch.color) ?? '#64748b';
  if ('kind' in patch) row.kind = writableText(patch.kind) ?? 'general';
  if ('isActive' in patch) row.active = patch.isActive !== false;
  if ('requiresApproval' in patch) row.requires_approval = patch.requiresApproval === true;
  if ('monthlyLimit' in patch) {
    row.monthly_limit = typeof patch.monthlyLimit === 'number' && patch.monthlyLimit > 0 ? patch.monthlyLimit : null;
  }
  return row;
}

export function toBudgetInsert(data: Omit<ExpenseBudget, 'id'>, context: WriteContext) {
  if (!(data.amount > 0)) throw new ExpenseWriteError('A budget amount must be greater than zero.');
  if (!data.startDate || !data.endDate) throw new ExpenseWriteError('A budget needs a start and an end date.');
  if (data.endDate < data.startDate) throw new ExpenseWriteError('That budget ends before it starts.');
  return {
    organization_id: requireUuid(context.organizationId, 'The farm'),
    category_id: data.categoryId ? requireUuid(data.categoryId, 'The category') : null,
    name: writableText(data.name) ?? 'Unnamed budget',
    amount: data.amount,
    currency: toCurrencyCode(context.currency),
    period: readPeriod(String(data.period)),
    start_date: data.startDate,
    end_date: data.endDate,
    alert_threshold_percent: Math.min(100, Math.max(0, amount(data.alertThresholdPercent))),
    active: data.isActive !== false,
    notes: writableText(data.notes),
    created_by: requireUuid(context.actorId, 'The signed-in account'),
  };
}

export function toBudgetUpdate(patch: Partial<ExpenseBudget>) {
  const row: Record<string, unknown> = {};
  if ('name' in patch) row.name = writableText(patch.name) ?? 'Unnamed budget';
  if ('amount' in patch) {
    if (!(Number(patch.amount) > 0)) throw new ExpenseWriteError('A budget amount must be greater than zero.');
    row.amount = Number(patch.amount);
  }
  if ('categoryId' in patch) row.category_id = patch.categoryId ? requireUuid(patch.categoryId, 'The category') : null;
  if ('period' in patch) row.period = readPeriod(String(patch.period));
  if ('startDate' in patch) row.start_date = patch.startDate;
  if ('endDate' in patch) row.end_date = patch.endDate;
  if ('alertThresholdPercent' in patch) {
    row.alert_threshold_percent = Math.min(100, Math.max(0, amount(patch.alertThresholdPercent)));
  }
  if ('isActive' in patch) row.active = patch.isActive !== false;
  if ('notes' in patch) row.notes = writableText(patch.notes);
  if (row.start_date && row.end_date && String(row.end_date) < String(row.start_date)) {
    throw new ExpenseWriteError('That budget ends before it starts.');
  }
  return row;
}

type NewExpense = Omit<ExpenseRecord, 'id' | 'submittedById' | 'submittedByName'>;

export function toExpenseInsert(data: NewExpense, context: WriteContext) {
  if (!(data.amount > 0)) throw new ExpenseWriteError('An expense amount must be greater than zero.');
  if (!data.date) throw new ExpenseWriteError('An expense needs a date.');
  const recurring = data.recurring === true;
  return {
    organization_id: requireUuid(context.organizationId, 'The farm'),
    category_id: requireUuid(data.categoryId, 'The category'),
    budget_id: data.budgetId ? requireUuid(data.budgetId, 'The budget') : null,
    title: writableText(data.title) ?? 'Untitled expense',
    amount: data.amount,
    currency: toCurrencyCode(context.currency),
    expense_date: data.date,
    vendor: writableText(data.vendor),
    payment_method: readPaymentMethod(String(data.paymentMethod)),
    status: readStatus(String(data.status)),
    recurring,
    recurrence: recurring ? (RECURRENCES.find(item => item === data.recurrence) ?? null) : null,
    cost_center: writableText(data.costCenter),
    reference: writableText(data.reference),
    notes: writableText(data.notes),
    submitted_by: requireUuid(context.actorId, 'The signed-in account'),
  };
}

export function toExpenseUpdate(patch: Partial<ExpenseRecord>) {
  const row: Record<string, unknown> = {};
  if ('title' in patch) row.title = writableText(patch.title) ?? 'Untitled expense';
  if ('amount' in patch) {
    if (!(Number(patch.amount) > 0)) throw new ExpenseWriteError('An expense amount must be greater than zero.');
    row.amount = Number(patch.amount);
  }
  if ('categoryId' in patch) row.category_id = requireUuid(patch.categoryId, 'The category');
  if ('budgetId' in patch) row.budget_id = patch.budgetId ? requireUuid(patch.budgetId, 'The budget') : null;
  if ('date' in patch) row.expense_date = patch.date;
  if ('vendor' in patch) row.vendor = writableText(patch.vendor);
  if ('paymentMethod' in patch) row.payment_method = readPaymentMethod(String(patch.paymentMethod));
  if ('status' in patch) row.status = readStatus(String(patch.status));
  if ('costCenter' in patch) row.cost_center = writableText(patch.costCenter);
  if ('reference' in patch) row.reference = writableText(patch.reference);
  if ('notes' in patch) row.notes = writableText(patch.notes);
  if ('recurring' in patch || 'recurrence' in patch) {
    const recurring = patch.recurring === true;
    row.recurring = recurring;
    // The table rejects a recurrence on a one-off expense, so the pair moves together.
    row.recurrence = recurring ? (RECURRENCES.find(item => item === patch.recurrence) ?? null) : null;
  }
  return row;
}

/** A decision records who made it; only a payable expense carries an approval time. */
export function toReviewUpdate(status: 'approved' | 'rejected' | 'paid', actorId: string, at: Date) {
  return {
    status,
    approved_by: requireUuid(actorId, 'The signed-in account'),
    approved_at: status === 'rejected' ? null : at.toISOString(),
  };
}
