'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle, BarChart3, Check, ChevronRight, CircleDollarSign, Download, Edit3,
  FolderCog, Loader2, Plus, ReceiptText, RefreshCw, Target, Trash2, X, XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/lib/store';
import { EXPENSE_CATEGORY_COLORS } from '@/lib/expenses/defaults';
import { useExpenses } from '@/lib/expenses/useExpenses';
import type {
  ExpenseBudget, ExpenseBudgetPeriod, ExpenseCategory, ExpensePaymentMethod, ExpenseRecord, ExpenseStatus,
} from '@/lib/expenses/types';

type Tab = 'overview' | 'expenses' | 'budgets' | 'categories';
type Modal = 'expense' | 'budget' | 'category' | null;

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;
const monthEnd = () => new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10);
const money = (currency: string, amount: number) => `${currency}${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const statusClasses: Record<ExpenseStatus, string> = {
  pending: 'bg-amber-100 text-amber-800', approved: 'bg-blue-100 text-blue-800',
  paid: 'bg-emerald-100 text-emerald-800', rejected: 'bg-red-100 text-red-800',
};

const emptyExpense = {
  title: '', amount: '', categoryId: '', date: today(), vendor: '', paymentMethod: 'cash',
  status: 'pending', budgetId: '', recurring: false, recurrence: 'monthly', costCenter: '', reference: '', receiptUrl: '', notes: '',
};
const emptyBudget = {
  name: '', amount: '', period: 'monthly', startDate: monthStart(), endDate: monthEnd(),
  categoryId: '', alertThresholdPercent: '80', isActive: true, notes: '',
};
const emptyCategory = {
  name: '', description: '', color: EXPENSE_CATEGORY_COLORS[0], kind: 'operational',
  isActive: true, requiresApproval: false, monthlyLimit: '',
};

export default function ExpensesPage() {
  const { currency, organization, activeIndustry } = useAppStore();
  const finance = useExpenses();
  const [tab, setTab] = useState<Tab>('overview');
  const [modal, setModal] = useState<Modal>(null);
  const [expenseForm, setExpenseForm] = useState(emptyExpense);
  const [budgetForm, setBudgetForm] = useState(emptyBudget);
  const [categoryForm, setCategoryForm] = useState(emptyCategory);
  const [editingId, setEditingId] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');

  const currentMonth = today().slice(0, 7);
  const approved = finance.expenses.filter(item => item.status === 'approved' || item.status === 'paid');
  const monthSpend = approved.filter(item => item.date.startsWith(currentMonth)).reduce((sum, item) => sum + item.amount, 0);
  const pending = finance.expenses.filter(item => item.status === 'pending');
  const recurringMonthly = finance.expenses.filter(item => item.recurring && item.status !== 'rejected').reduce((sum, item) => {
    if (item.recurrence === 'weekly') return sum + item.amount * 52 / 12;
    if (item.recurrence === 'quarterly') return sum + item.amount / 3;
    if (item.recurrence === 'annual') return sum + item.amount / 12;
    return sum + item.amount;
  }, 0);
  const activeBudget = finance.budgetHealth.filter(item => item.isActive && today() >= item.startDate && today() <= item.endDate);
  const availableFunds = activeBudget.reduce((sum, item) => sum + item.available, 0);
  const filteredExpenses = finance.expenses.filter(item =>
    `${item.title} ${item.vendor} ${item.categoryName} ${item.reference}`.toLowerCase().includes(search.toLowerCase()),
  );
  const categorySpend = useMemo(() => approved.reduce<Record<string, number>>((totals, item) => {
    totals[item.categoryName] = (totals[item.categoryName] ?? 0) + item.amount;
    return totals;
  }, {}), [approved]);
  const monthlyCategorySpend = useMemo(() => approved.filter(item => item.date.startsWith(currentMonth)).reduce<Record<string, number>>((totals, item) => {
    totals[item.categoryName] = (totals[item.categoryName] ?? 0) + item.amount;
    return totals;
  }, {}), [approved, currentMonth]);
  const topCategory = Object.entries(categorySpend).sort((a, b) => b[1] - a[1])[0];
  const alerts = [
    ...finance.budgetHealth.filter(item => item.isActive && item.spent / item.amount * 100 >= item.alertThresholdPercent)
      .map(item => `${item.name} has used ${Math.round(item.spent / item.amount * 100)}% of its allocation.`),
    ...finance.categories.filter(item => item.monthlyLimit && (monthlyCategorySpend[item.name] ?? 0) >= item.monthlyLimit)
      .map(item => `${item.name} has reached its monthly category limit.`),
    ...(pending.length > 0 ? [`${pending.length} expense${pending.length === 1 ? '' : 's'} awaiting approval.`] : []),
    ...(recurringMonthly > 0 ? [`Recurring expenses project to ${money(currency, recurringMonthly)} per month.`] : []),
  ];

  function showError(error: unknown) {
    setMessage(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
  }

  function closeModal() {
    setModal(null); setEditingId(''); setMessage('');
    setExpenseForm(emptyExpense); setBudgetForm(emptyBudget); setCategoryForm(emptyCategory);
  }

  function editExpense(item: ExpenseRecord) {
    setEditingId(item.id);
    setExpenseForm({
      title: item.title, amount: String(item.amount), categoryId: item.categoryId, date: item.date,
      vendor: item.vendor ?? '', paymentMethod: item.paymentMethod, status: item.status,
      budgetId: item.budgetId ?? '', recurring: item.recurring, recurrence: item.recurrence ?? 'monthly',
      costCenter: item.costCenter ?? '', reference: item.reference ?? '', receiptUrl: item.receiptUrl ?? '', notes: item.notes ?? '',
    });
    setModal('expense');
  }

  function editBudget(item: ExpenseBudget) {
    setEditingId(item.id);
    setBudgetForm({
      name: item.name, amount: String(item.amount), period: item.period, startDate: item.startDate, endDate: item.endDate,
      categoryId: item.categoryId ?? '', alertThresholdPercent: String(item.alertThresholdPercent), isActive: item.isActive, notes: item.notes ?? '',
    });
    setModal('budget');
  }

  function editCategory(item: ExpenseCategory) {
    setEditingId(item.id);
    setCategoryForm({
      name: item.name, description: item.description ?? '', color: item.color, kind: item.kind,
      isActive: item.isActive, requiresApproval: item.requiresApproval, monthlyLimit: item.monthlyLimit ? String(item.monthlyLimit) : '',
    });
    setModal('category');
  }

  async function saveExpense(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      const category = finance.categories.find(item => item.id === expenseForm.categoryId);
      const budget = finance.budgets.find(item => item.id === expenseForm.budgetId);
      if (!category) throw new Error('Select an expense category.');
      if (Number(expenseForm.amount) <= 0) throw new Error('Amount must be greater than zero.');
      const data = {
        ...expenseForm, amount: Number(expenseForm.amount), categoryName: category.name,
        budgetName: budget?.name, status: category.requiresApproval ? 'pending' as const : finance.canManage ? expenseForm.status as ExpenseStatus : 'pending' as const,
        paymentMethod: expenseForm.paymentMethod as ExpensePaymentMethod,
        recurrence: expenseForm.recurrence as ExpenseRecord['recurrence'],
      };
      if (editingId) await finance.updateExpense(editingId, data);
      else await finance.addExpense(data);
      closeModal();
    } catch (error) { showError(error); } finally { setSaving(false); }
  }

  async function saveBudget(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      const category = finance.categories.find(item => item.id === budgetForm.categoryId);
      if (Number(budgetForm.amount) <= 0) throw new Error('Budget amount must be greater than zero.');
      if (budgetForm.endDate < budgetForm.startDate) throw new Error('Budget end date must be after its start date.');
      const data = {
        ...budgetForm, amount: Number(budgetForm.amount), alertThresholdPercent: Number(budgetForm.alertThresholdPercent),
        categoryName: category?.name, period: budgetForm.period as ExpenseBudgetPeriod,
      };
      if (editingId) await finance.updateBudget(editingId, data);
      else await finance.addBudget(data);
      closeModal();
    } catch (error) { showError(error); } finally { setSaving(false); }
  }

  async function saveCategory(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      if (!categoryForm.name.trim()) throw new Error('Category name is required.');
      const data = { ...categoryForm, name: categoryForm.name.trim(), monthlyLimit: categoryForm.monthlyLimit ? Number(categoryForm.monthlyLimit) : undefined };
      if (editingId) await finance.updateCategory(editingId, data);
      else await finance.addCategory(data);
      closeModal();
    } catch (error) { showError(error); } finally { setSaving(false); }
  }

  async function remove(kind: 'expense' | 'budget' | 'category', id: string) {
    if (!window.confirm(`Delete this ${kind}? This action cannot be undone.`)) return;
    try {
      if (kind === 'expense') await finance.deleteExpense(id);
      if (kind === 'budget') await finance.deleteBudget(id);
      if (kind === 'category') await finance.deleteCategory(id);
    } catch (error) { showError(error); }
  }

  function exportCsv() {
    const rows = [['Date', 'Title', 'Category', 'Vendor', 'Amount', 'Status', 'Payment Method', 'Reference'],
      ...finance.expenses.map(item => [item.date, item.title, item.categoryName, item.vendor ?? '', item.amount, item.status, item.paymentMethod, item.reference ?? ''])];
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `${organization?.name ?? 'organization'}-expenses-${today()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const tabs: Array<[Tab, string, React.ElementType]> = [
    ['overview', 'Overview', BarChart3], ['expenses', 'Expenses', ReceiptText],
    ['budgets', 'Budgets', Target], ['categories', 'Categories', FolderCog],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Expense Intelligence</h1>
          <p className="text-sm text-muted-foreground">Control spending, approvals, and allocated funds across {organization?.name ?? 'your organization'}.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}><Download className="w-4 h-4 mr-2" /> Export</Button>
          <Button onClick={() => setModal('expense')}><Plus className="w-4 h-4 mr-2" /> Add Expense</Button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border bg-background p-1">
        {tabs.map(([id, label, Icon]) => <button key={id} onClick={() => setTab(id)} className={`flex min-w-max items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${tab === id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}><Icon className="h-4 w-4" />{label}</button>)}
      </div>

      {message && <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}<button onClick={() => setMessage('')}><X className="h-4 w-4" /></button></div>}

      {finance.loading ? <div className="flex justify-center py-20 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading finance workspace...</div> : <>
        {tab === 'overview' && <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Spend this month" value={money(currency, monthSpend)} icon={CircleDollarSign} />
            <Stat label="Available allocated funds" value={money(currency, availableFunds)} icon={Target} />
            <Stat label="Pending approvals" value={String(pending.length)} icon={AlertTriangle} />
            <Stat label="Projected recurring / month" value={money(currency, recurringMonthly)} icon={RefreshCw} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2"><CardHeader><CardTitle className="text-base">Budget Health</CardTitle></CardHeader><CardContent className="space-y-4">
              {finance.budgetHealth.length === 0 ? <Empty text="Create an expense budget to track allocated funds and remaining balances." action={finance.canManage ? () => setModal('budget') : undefined} /> :
                finance.budgetHealth.slice(0, 5).map(item => <BudgetBar key={item.id} item={item} currency={currency} />)}
            </CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Smart Insights</CardTitle></CardHeader><CardContent className="space-y-3">
              {alerts.length === 0 && !topCategory ? <p className="text-sm text-muted-foreground">Insights will appear as your team records expenses.</p> : <>
                {alerts.slice(0, 4).map(alert => <div key={alert} className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{alert}</div>)}
                {topCategory && <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900"><strong>{topCategory[0]}</strong> is your highest spend category at {money(currency, topCategory[1])}.</div>}
              </>}
            </CardContent></Card>
          </div>
          <ExpenseList items={finance.expenses.slice(0, 8)} currency={currency} canManage={finance.canManage} onEdit={editExpense} onDelete={id => remove('expense', id)} onReview={finance.reviewExpense} />
        </>}

        {tab === 'expenses' && <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Input className="sm:max-w-sm" placeholder="Search title, vendor, category, reference..." value={search} onChange={event => setSearch(event.target.value)} />
            <Button onClick={() => setModal('expense')}><Plus className="mr-2 h-4 w-4" /> Add Expense</Button>
          </div>
          <ExpenseList items={filteredExpenses} currency={currency} canManage={finance.canManage} onEdit={editExpense} onDelete={id => remove('expense', id)} onReview={finance.reviewExpense} />
        </>}

        {tab === 'budgets' && <>
          <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Allocated funds are reduced by approved and paid expenses; pending requests appear as commitments.</p>{finance.canManage && <Button onClick={() => setModal('budget')}><Plus className="mr-2 h-4 w-4" /> New Budget</Button>}</div>
          <div className="grid gap-4 lg:grid-cols-2">{finance.budgetHealth.length === 0 ? <Card className="lg:col-span-2"><CardContent className="py-10"><Empty text="No budgets yet." action={() => setModal('budget')} /></CardContent></Card> : finance.budgetHealth.map(item =>
            <Card key={item.id}><CardContent className="p-5"><BudgetBar item={item} currency={currency} /><div className="mt-4 flex justify-end gap-2">{finance.canManage && <><Button size="sm" variant="outline" onClick={() => editBudget(item)}><Edit3 className="h-4 w-4" /></Button><Button size="sm" variant="outline" onClick={() => remove('budget', item.id)}><Trash2 className="h-4 w-4 text-red-600" /></Button></>}</div></CardContent></Card>)}</div>
        </>}

        {tab === 'categories' && <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">Customize exactly what {organization?.name ?? 'your organization'} spends money on.</p>{finance.canManage && <div className="flex gap-2"><Button variant="outline" onClick={async () => { try { await finance.seedCategories(); } catch (error) { showError(error); } }}><RefreshCw className="mr-2 h-4 w-4" /> Add {activeIndustry} defaults</Button><Button onClick={() => setModal('category')}><Plus className="mr-2 h-4 w-4" /> New Category</Button></div>}</div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{finance.categories.length === 0 ? <Card className="md:col-span-2 xl:col-span-3"><CardContent className="py-10"><Empty text="Add categories or load tailored industry defaults." /></CardContent></Card> : finance.categories.map(item =>
            <Card key={item.id}><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div className="flex gap-3"><span className="mt-1 h-3 w-3 rounded-full" style={{ background: item.color }} /><div><p className="font-semibold">{item.name}</p><p className="text-xs capitalize text-muted-foreground">{item.kind.replaceAll('_', ' ')}{!item.isActive ? ' - Archived' : ''}</p></div></div>{finance.canManage && <div className="flex gap-1"><button onClick={() => editCategory(item)} className="rounded p-1.5 hover:bg-muted"><Edit3 className="h-4 w-4" /></button><button onClick={() => remove('category', item.id)} className="rounded p-1.5 hover:bg-muted"><Trash2 className="h-4 w-4 text-red-600" /></button></div>}</div>{item.description && <p className="mt-3 text-sm text-muted-foreground">{item.description}</p>}<div className="mt-3 flex gap-2">{item.requiresApproval && <Badge variant="outline">Approval required</Badge>}{item.monthlyLimit && <Badge variant="outline">{money(currency, item.monthlyLimit)} monthly limit</Badge>}</div></CardContent></Card>)}</div>
        </>}
      </>}

      {modal === 'expense' && <ModalShell title={editingId ? 'Edit Expense' : 'Record Expense'} onClose={closeModal}><form onSubmit={saveExpense} className="grid gap-3 sm:grid-cols-2">
        <Field label="Expense title *"><Input value={expenseForm.title} onChange={e => setExpenseForm({ ...expenseForm, title: e.target.value })} required /></Field>
        <Field label={`Amount (${currency}) *`}><Input type="number" min="0.01" step="0.01" value={expenseForm.amount} onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })} required /></Field>
        <Field label="Category *"><Select value={expenseForm.categoryId} onChange={value => setExpenseForm({ ...expenseForm, categoryId: value })}><option value="">Select category</option>{finance.categories.filter(item => item.isActive).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
        <Field label="Expense date *"><Input type="date" value={expenseForm.date} onChange={e => setExpenseForm({ ...expenseForm, date: e.target.value })} required /></Field>
        <Field label="Vendor / payee"><Input value={expenseForm.vendor} onChange={e => setExpenseForm({ ...expenseForm, vendor: e.target.value })} /></Field>
        <Field label="Payment method"><Select value={expenseForm.paymentMethod} onChange={value => setExpenseForm({ ...expenseForm, paymentMethod: value })}>{['cash','card','bank_transfer','mobile_money','credit','other'].map(item => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</Select></Field>
        <Field label="Charge to budget"><Select value={expenseForm.budgetId} onChange={value => setExpenseForm({ ...expenseForm, budgetId: value })}><option value="">No specific budget</option>{finance.budgets.filter(item => item.isActive).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
        {finance.canManage && <Field label="Status"><Select value={expenseForm.status} onChange={value => setExpenseForm({ ...expenseForm, status: value })}>{['pending','approved','paid','rejected'].map(item => <option key={item} value={item}>{item}</option>)}</Select></Field>}
        <Field label="Cost center / project"><Input value={expenseForm.costCenter} onChange={e => setExpenseForm({ ...expenseForm, costCenter: e.target.value })} /></Field>
        <Field label="Invoice / reference"><Input value={expenseForm.reference} onChange={e => setExpenseForm({ ...expenseForm, reference: e.target.value })} /></Field>
        <Field label="Receipt link"><Input type="url" placeholder="https://..." value={expenseForm.receiptUrl} onChange={e => setExpenseForm({ ...expenseForm, receiptUrl: e.target.value })} /></Field>
        <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={expenseForm.recurring} onChange={e => setExpenseForm({ ...expenseForm, recurring: e.target.checked })} /> Recurring expense</label>
        {expenseForm.recurring && <Field label="Repeats"><Select value={expenseForm.recurrence} onChange={value => setExpenseForm({ ...expenseForm, recurrence: value })}>{['weekly','monthly','quarterly','annual'].map(item => <option key={item}>{item}</option>)}</Select></Field>}
        <Field label="Notes" wide><textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" value={expenseForm.notes} onChange={e => setExpenseForm({ ...expenseForm, notes: e.target.value })} /></Field>
        <FormActions saving={saving} message={message} onCancel={closeModal} />
      </form></ModalShell>}

      {modal === 'budget' && <ModalShell title={editingId ? 'Edit Budget' : 'Create Expense Budget'} onClose={closeModal}><form onSubmit={saveBudget} className="grid gap-3 sm:grid-cols-2">
        <Field label="Budget name *"><Input value={budgetForm.name} onChange={e => setBudgetForm({ ...budgetForm, name: e.target.value })} required /></Field>
        <Field label={`Allocated amount (${currency}) *`}><Input type="number" min="0.01" step="0.01" value={budgetForm.amount} onChange={e => setBudgetForm({ ...budgetForm, amount: e.target.value })} required /></Field>
        <Field label="Period"><Select value={budgetForm.period} onChange={value => setBudgetForm({ ...budgetForm, period: value })}>{['monthly','quarterly','annual','custom'].map(item => <option key={item}>{item}</option>)}</Select></Field>
        <Field label="Category"><Select value={budgetForm.categoryId} onChange={value => setBudgetForm({ ...budgetForm, categoryId: value })}><option value="">All / general spending</option>{finance.categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
        <Field label="Start date *"><Input type="date" value={budgetForm.startDate} onChange={e => setBudgetForm({ ...budgetForm, startDate: e.target.value })} required /></Field>
        <Field label="End date *"><Input type="date" value={budgetForm.endDate} onChange={e => setBudgetForm({ ...budgetForm, endDate: e.target.value })} required /></Field>
        <Field label="Alert at % used"><Input type="number" min="1" max="100" value={budgetForm.alertThresholdPercent} onChange={e => setBudgetForm({ ...budgetForm, alertThresholdPercent: e.target.value })} /></Field>
        <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={budgetForm.isActive} onChange={e => setBudgetForm({ ...budgetForm, isActive: e.target.checked })} /> Active budget</label>
        <Field label="Notes" wide><textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" value={budgetForm.notes} onChange={e => setBudgetForm({ ...budgetForm, notes: e.target.value })} /></Field>
        <FormActions saving={saving} message={message} onCancel={closeModal} />
      </form></ModalShell>}

      {modal === 'category' && <ModalShell title={editingId ? 'Edit Expense Category' : 'Create Expense Category'} onClose={closeModal}><form onSubmit={saveCategory} className="grid gap-3 sm:grid-cols-2">
        <Field label="Category name *"><Input value={categoryForm.name} onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })} required /></Field>
        <Field label="Type"><Select value={categoryForm.kind} onChange={value => setCategoryForm({ ...categoryForm, kind: value })}>{['operational','administrative','payroll','utilities','inventory','maintenance','transport','marketing','compliance','other'].map(item => <option key={item}>{item}</option>)}</Select></Field>
        <Field label={`Monthly limit (${currency})`}><Input type="number" min="0" step="0.01" value={categoryForm.monthlyLimit} onChange={e => setCategoryForm({ ...categoryForm, monthlyLimit: e.target.value })} /></Field>
        <Field label="Color"><div className="flex flex-wrap gap-2 pt-1">{EXPENSE_CATEGORY_COLORS.map(color => <button type="button" key={color} onClick={() => setCategoryForm({ ...categoryForm, color })} className={`h-7 w-7 rounded-full ${categoryForm.color === color ? 'ring-2 ring-offset-2 ring-primary' : ''}`} style={{ background: color }} />)}</div></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={categoryForm.requiresApproval} onChange={e => setCategoryForm({ ...categoryForm, requiresApproval: e.target.checked })} /> Always requires approval</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={categoryForm.isActive} onChange={e => setCategoryForm({ ...categoryForm, isActive: e.target.checked })} /> Active category</label>
        <Field label="Description" wide><textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" value={categoryForm.description} onChange={e => setCategoryForm({ ...categoryForm, description: e.target.value })} /></Field>
        <FormActions saving={saving} message={message} onCancel={closeModal} />
      </form></ModalShell>}
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
  return <Card><CardContent className="p-4"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4" /></div><p className="mt-2 text-xl font-bold">{value}</p></CardContent></Card>;
}

function BudgetBar({ item, currency }: { item: ExpenseBudget & { spent: number; committed: number; remaining: number; available: number }; currency: string }) {
  const percent = item.amount ? Math.min(100, item.spent / item.amount * 100) : 0;
  return <div><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{item.name}</p><p className="text-xs text-muted-foreground">{item.startDate} to {item.endDate}{item.categoryName ? ` - ${item.categoryName}` : ''}</p></div><Badge variant="outline">{item.isActive ? 'Active' : 'Inactive'}</Badge></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full ${percent >= item.alertThresholdPercent ? 'bg-red-500' : 'bg-primary'}`} style={{ width: `${percent}%` }} /></div><div className="mt-2 grid grid-cols-3 gap-2 text-xs"><span>Spent <strong className="block text-foreground">{money(currency, item.spent)}</strong></span><span>Committed <strong className="block text-foreground">{money(currency, item.committed)}</strong></span><span>Available <strong className="block text-foreground">{money(currency, item.available)}</strong></span></div></div>;
}

function ExpenseList({ items, currency, canManage, onEdit, onDelete, onReview }: { items: ExpenseRecord[]; currency: string; canManage: boolean; onEdit: (item: ExpenseRecord) => void; onDelete: (id: string) => void; onReview: (id: string, status: 'approved' | 'rejected' | 'paid') => Promise<unknown> }) {
  return <Card><CardHeader><CardTitle className="text-base">Expense Records</CardTitle></CardHeader><CardContent className="p-0">{items.length === 0 ? <Empty text="No expense records yet." /> : <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm"><thead className="border-y bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr>{['Date','Expense','Category','Amount','Status','Submitted by','Actions'].map(item => <th key={item} className="px-4 py-3">{item}</th>)}</tr></thead><tbody className="divide-y">{items.map(item => <tr key={item.id} className="hover:bg-muted/30"><td className="px-4 py-3 text-muted-foreground">{item.date}</td><td className="px-4 py-3"><p className="font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.vendor || item.reference || 'No vendor or reference'}</p></td><td className="px-4 py-3">{item.categoryName}</td><td className="px-4 py-3 font-semibold">{money(currency, item.amount)}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium capitalize ${statusClasses[item.status]}`}>{item.status}</span></td><td className="px-4 py-3 text-muted-foreground">{item.submittedByName}</td><td className="px-4 py-3"><div className="flex gap-1">{canManage && item.status === 'pending' && <><button title="Approve" onClick={() => onReview(item.id, 'approved')} className="rounded p-1.5 hover:bg-emerald-50"><Check className="h-4 w-4 text-emerald-600" /></button><button title="Reject" onClick={() => onReview(item.id, 'rejected')} className="rounded p-1.5 hover:bg-red-50"><XCircle className="h-4 w-4 text-red-600" /></button></>} {canManage && <><button title="Edit" onClick={() => onEdit(item)} className="rounded p-1.5 hover:bg-muted"><Edit3 className="h-4 w-4" /></button><button title="Delete" onClick={() => onDelete(item.id)} className="rounded p-1.5 hover:bg-red-50"><Trash2 className="h-4 w-4 text-red-600" /></button></>} {item.receiptUrl && <a title="Open receipt" href={item.receiptUrl} target="_blank" rel="noreferrer" className="rounded p-1.5 hover:bg-muted"><ChevronRight className="h-4 w-4" /></a>}</div></td></tr>)}</tbody></table></div>}</CardContent></Card>;
}

function Empty({ text, action }: { text: string; action?: () => void }) {
  return <div className="py-8 text-center text-sm text-muted-foreground"><ReceiptText className="mx-auto mb-2 h-7 w-7 opacity-30" /><p>{text}</p>{action && <Button className="mt-3" size="sm" onClick={action}><Plus className="mr-2 h-4 w-4" /> Get started</Button>}</div>;
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-3"><Card className="max-h-[92vh] w-full max-w-2xl overflow-y-auto"><CardHeader className="sticky top-0 z-10 flex flex-row items-center justify-between border-b bg-background"><CardTitle className="text-lg">{title}</CardTitle><button onClick={onClose}><X className="h-5 w-5" /></button></CardHeader><CardContent className="p-5">{children}</CardContent></Card></div>;
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`block text-sm font-medium ${wide ? 'sm:col-span-2' : ''}`}>{label}<div className="mt-1">{children}</div></label>;
}

function Select({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={value} onChange={event => onChange(event.target.value)}>{children}</select>;
}

function FormActions({ saving, message, onCancel }: { saving: boolean; message: string; onCancel: () => void }) {
  return <div className="sm:col-span-2"><p className="mb-2 text-sm text-red-600">{message}</p><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button></div></div>;
}
