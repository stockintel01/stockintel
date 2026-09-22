import assert from 'node:assert/strict';
import { computeBudgetHealth } from '../lib/expenses/budget-health.ts';
import {
  ExpenseWriteError,
  UNKNOWN_MEMBER,
  normalizeCurrency,
  toBudgetInsert,
  toBudgetUpdate,
  toCategoryInsert,
  toCategoryUpdate,
  toExpenseBudget,
  toExpenseCategory,
  toExpenseInsert,
  toExpenseRecord,
  toExpenseUpdate,
  toReviewUpdate,
} from '../lib/expenses/supabase-mapping.ts';

const ORG = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const CATEGORY = '33333333-3333-4333-8333-333333333333';
const BUDGET = '44444444-4444-4444-8444-444444444444';
const OTHER_MEMBER = '55555555-5555-4555-8555-555555555555';
const context = { organizationId: ORG, actorId: ACTOR, currency: 'ghs' };

const lookups = {
  categoryName: id => (id === CATEGORY ? 'Fuel' : undefined),
  budgetName: id => (id === BUDGET ? 'Q3 fuel' : undefined),
  memberName: id => (id === ACTOR ? 'Ama Mensah' : undefined),
  receiptUrl: path => (path === 'org/receipt.pdf' ? 'https://signed.example/receipt.pdf' : undefined),
};

const expenseRow = {
  id: '66666666-6666-4666-8666-666666666666',
  category_id: CATEGORY,
  budget_id: BUDGET,
  title: 'Diesel for the pump',
  amount: '412.50',
  expense_date: '2026-09-18',
  vendor: '  Total Kade  ',
  payment_method: 'mobile_money',
  status: 'approved',
  recurring: false,
  recurrence: null,
  cost_center: null,
  reference: 'INV-2291',
  receipt_storage_path: 'org/receipt.pdf',
  notes: '',
  submitted_by: ACTOR,
  approved_by: OTHER_MEMBER,
  approved_at: '2026-09-19T09:00:00.000Z',
  created_at: '2026-09-18T07:00:00.000Z',
  updated_at: '2026-09-19T09:00:00.000Z',
};

// ── Rows become records the screen already knows how to render ───────────────
const record = toExpenseRecord(expenseRow, lookups);
assert.equal(record.amount, 412.5, 'a numeric column arriving as a string is still money');
assert.equal(record.categoryName, 'Fuel', 'the category name is joined back on');
assert.equal(record.budgetName, 'Q3 fuel');
assert.equal(record.vendor, 'Total Kade', 'stored padding never reaches the table');
assert.equal(record.notes, undefined, 'an empty column reads as absent, not as an empty note');
assert.equal(record.receiptUrl, 'https://signed.example/receipt.pdf');
assert.equal(record.submittedByName, 'Ama Mensah');
assert.equal(record.approvedByName, UNKNOWN_MEMBER, 'a colleague a worker cannot look up is still shown as someone');

const unloaded = toExpenseRecord(expenseRow, { ...lookups, categoryName: () => undefined });
assert.equal(unloaded.categoryName, '', 'a name that has not arrived yet is blank, never the literal undefined');

assert.equal(toExpenseRecord({ ...expenseRow, status: 'void' }, lookups).status, 'rejected',
  'the fifth database status has no badge and means the money is not owed');
assert.equal(toExpenseRecord({ ...expenseRow, status: 'nonsense' }, lookups).status, 'pending');
assert.equal(toExpenseRecord({ ...expenseRow, payment_method: 'crypto' }, lookups).paymentMethod, 'other');
assert.equal(toExpenseRecord({ ...expenseRow, recurring: false, recurrence: 'weekly' }, lookups).recurrence, undefined,
  'a one-off expense never claims a recurrence');
assert.equal(toExpenseRecord({ ...expenseRow, receipt_storage_path: null }, lookups).receiptUrl, undefined);
assert.equal(toExpenseRecord({ ...expenseRow, budget_id: null }, lookups).budgetName, undefined);

const category = toExpenseCategory({
  id: CATEGORY, name: 'Fuel', description: null, color: '#123456', kind: 'operational',
  active: false, requires_approval: true, monthly_limit: '500',
  created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
});
assert.equal(category.isActive, false, 'active maps to isActive, not to a missing field');
assert.equal(category.requiresApproval, true);
assert.equal(category.monthlyLimit, 500);
assert.equal(category.description, undefined);

const budget = toExpenseBudget({
  id: BUDGET, category_id: CATEGORY, name: 'Q3 fuel', amount: 5000, period: 'quarterly',
  start_date: '2026-07-01', end_date: '2026-09-30', alert_threshold_percent: '75',
  active: true, notes: null, created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z',
}, lookups);
assert.equal(budget.categoryName, 'Fuel');
assert.equal(budget.alertThresholdPercent, 75);
const oddBudget = toExpenseBudget({
  id: BUDGET, category_id: null, name: 'Ad hoc', amount: 1, period: 'fortnightly',
  start_date: '2026-07-01', end_date: '2026-07-31', alert_threshold_percent: 1,
  active: true, notes: null, created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z',
}, lookups);
assert.equal(oddBudget.period, 'custom', 'a period the type never declared falls back rather than reaching the check constraint');
assert.equal(oddBudget.categoryId, undefined, 'a budget that covers the whole farm has no category');

// ── Records become rows Postgres accepts ─────────────────────────────────────
const insert = toExpenseInsert({
  title: '  Diesel  ', amount: 412.5, categoryId: CATEGORY, categoryName: 'Fuel', date: '2026-09-18',
  vendor: '', paymentMethod: 'mobile_money', status: 'pending', budgetId: BUDGET, budgetName: 'Q3 fuel',
  recurring: false, recurrence: 'weekly', costCenter: '', reference: 'INV-2291', notes: 'x',
}, context);
assert.equal(insert.organization_id, ORG);
assert.equal(insert.submitted_by, ACTOR);
assert.equal(insert.currency, 'GHS', 'the currency reaches the column as an upper-case code');
assert.equal(insert.title, 'Diesel');
assert.equal(insert.vendor, null, 'an empty box is stored as nothing, not as an empty string');
assert.equal(insert.recurrence, null, 'the table rejects a recurrence on a one-off expense');
assert.equal('categoryName' in insert, false, 'denormalised names are not columns');
assert.equal('submittedByName' in insert, false);

const newExpense = { title: 'x', amount: 1, categoryId: CATEGORY, categoryName: 'Fuel', date: '2026-09-18', paymentMethod: 'cash', status: 'pending', recurring: false };
assert.throws(() => toExpenseInsert({ ...newExpense, amount: 0 }, context), ExpenseWriteError);
assert.throws(() => toExpenseInsert({ ...newExpense, date: '' }, context), ExpenseWriteError);
assert.throws(() => toExpenseInsert(newExpense, { ...context, organizationId: 'org-1' }), ExpenseWriteError,
  'a Firestore document id must never be written into a uuid column');
assert.throws(() => toExpenseInsert(newExpense, { ...context, actorId: 'firebase-uid' }), ExpenseWriteError);
assert.throws(() => toExpenseInsert({ ...newExpense, categoryId: 'cat-1' }, context), ExpenseWriteError);

assert.equal(normalizeCurrency(undefined), 'GHS');
assert.equal(normalizeCurrency('usd'), 'USD');
assert.equal(normalizeCurrency('Ghana cedi'), 'GHS', 'a label that is not a code falls back rather than failing the insert');

const categoryInsert = toCategoryInsert({ name: ' Fuel ', color: '', kind: '', isActive: true, requiresApproval: false, monthlyLimit: 0 }, context);
assert.equal(categoryInsert.name, 'Fuel');
assert.equal(categoryInsert.color, '#64748b', 'a blank colour takes the default the column expects');
assert.equal(categoryInsert.kind, 'general');
assert.equal(categoryInsert.monthly_limit, null, 'a zero limit is no limit');
assert.throws(() => toCategoryInsert({ name: '   ', color: '#fff', kind: 'x', isActive: true, requiresApproval: false }, context), ExpenseWriteError);

// ── A patch touches only what it names ───────────────────────────────────────
const patch = toExpenseUpdate({ status: 'paid' });
assert.deepEqual(Object.keys(patch), ['status'], 'an untouched column is not overwritten with a default');

const cleared = toExpenseUpdate({ vendor: '', reference: '   ' });
assert.equal(cleared.vendor, null, 'emptying a box clears the column');
assert.equal(cleared.reference, null);
assert.deepEqual(Object.keys(toExpenseUpdate({})), [], 'an empty patch writes nothing at all');

const stopRecurring = toExpenseUpdate({ recurring: false });
assert.equal(stopRecurring.recurrence, null, 'recurrence always travels with recurring');
assert.equal(toExpenseUpdate({ recurring: true, recurrence: 'monthly' }).recurrence, 'monthly');
assert.equal(toExpenseUpdate({ recurring: true, recurrence: 'hourly' }).recurrence, null);
assert.throws(() => toExpenseUpdate({ amount: 0 }), ExpenseWriteError);
assert.throws(() => toExpenseUpdate({ categoryId: 'cat-1' }), ExpenseWriteError);
assert.equal(toExpenseUpdate({ budgetId: undefined }).budget_id, null, 'detaching a budget is a real change');

assert.deepEqual(Object.keys(toCategoryUpdate({ isActive: false })), ['active']);
assert.equal(toCategoryUpdate({ monthlyLimit: undefined }).monthly_limit, null);
assert.throws(() => toCategoryUpdate({ name: '' }), ExpenseWriteError);

const budgetInsert = toBudgetInsert({
  name: '', amount: 5000, period: 'quarterly', startDate: '2026-07-01', endDate: '2026-09-30',
  categoryId: CATEGORY, alertThresholdPercent: 180, isActive: true, notes: '',
}, context);
assert.equal(budgetInsert.name, 'Unnamed budget');
assert.equal(budgetInsert.alert_threshold_percent, 100, 'the column only accepts 0 to 100');
assert.equal(budgetInsert.currency, 'GHS');
assert.throws(() => toBudgetInsert({ name: 'x', amount: 5000, period: 'custom', startDate: '2026-09-30', endDate: '2026-07-01', alertThresholdPercent: 80, isActive: true }, context), ExpenseWriteError);
assert.throws(() => toBudgetUpdate({ startDate: '2026-09-30', endDate: '2026-07-01' }), ExpenseWriteError);
assert.equal(toBudgetUpdate({ alertThresholdPercent: -5 }).alert_threshold_percent, 0);

// ── A decision records who made it ───────────────────────────────────────────
const at = new Date('2026-09-20T10:00:00.000Z');
assert.deepEqual(toReviewUpdate('approved', ACTOR, at), { status: 'approved', approved_by: ACTOR, approved_at: at.toISOString() });
assert.equal(toReviewUpdate('rejected', ACTOR, at).approved_at, null, 'a rejection records the decider, never an approval time');
assert.equal(toReviewUpdate('paid', ACTOR, at).approved_at, at.toISOString());
assert.throws(() => toReviewUpdate('approved', 'firebase-uid', at), ExpenseWriteError);

// ── Budget health is the same arithmetic on both backends ────────────────────
const budgets = [{ id: BUDGET, name: 'Q3 fuel', amount: 1000, period: 'quarterly', startDate: '2026-07-01', endDate: '2026-09-30', categoryId: CATEGORY, alertThresholdPercent: 80, isActive: true }];
const expense = (over) => ({ id: crypto.randomUUID(), title: 't', amount: 100, categoryId: CATEGORY, categoryName: 'Fuel', date: '2026-08-01', paymentMethod: 'cash', status: 'approved', recurring: false, submittedById: ACTOR, submittedByName: 'Ama', ...over });

const health = computeBudgetHealth(budgets, [
  expense({ budgetId: BUDGET, amount: 300, status: 'approved' }),
  expense({ budgetId: BUDGET, amount: 200, status: 'paid' }),
  expense({ budgetId: BUDGET, amount: 150, status: 'pending' }),
  expense({ budgetId: BUDGET, amount: 999, status: 'rejected' }),
  expense({ amount: 400, status: 'approved' }),
  expense({ budgetId: BUDGET, amount: 500, date: '2026-10-05' }),
])[0];
assert.equal(health.spent, 900, 'approved and paid money is spent, including an uncategorised match on the budget category');
assert.equal(health.committed, 150);
assert.equal(health.remaining, 100);
assert.equal(health.available, 0, 'a budget never reports negative headroom');
assert.equal(computeBudgetHealth(budgets, [expense({ budgetId: BUDGET, amount: 5000 })])[0].remaining, 0);

console.log('Supabase expense ledger verified (row conversions, partial updates, identity guards, budget health).');
