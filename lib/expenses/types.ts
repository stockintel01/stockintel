export type ExpenseStatus = 'pending' | 'approved' | 'paid' | 'rejected';
export type ExpensePaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'mobile_money' | 'credit' | 'other';
export type ExpenseBudgetPeriod = 'monthly' | 'quarterly' | 'annual' | 'custom';

export interface ExpenseCategory {
  id: string;
  name: string;
  description?: string;
  color: string;
  kind: string;
  isActive: boolean;
  requiresApproval: boolean;
  monthlyLimit?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ExpenseBudget {
  id: string;
  name: string;
  amount: number;
  period: ExpenseBudgetPeriod;
  startDate: string;
  endDate: string;
  categoryId?: string;
  categoryName?: string;
  alertThresholdPercent: number;
  isActive: boolean;
  notes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ExpenseRecord {
  id: string;
  title: string;
  amount: number;
  categoryId: string;
  categoryName: string;
  date: string;
  vendor?: string;
  paymentMethod: ExpensePaymentMethod;
  status: ExpenseStatus;
  budgetId?: string;
  budgetName?: string;
  recurring: boolean;
  recurrence?: 'weekly' | 'monthly' | 'quarterly' | 'annual';
  costCenter?: string;
  reference?: string;
  receiptUrl?: string;
  notes?: string;
  submittedById: string;
  submittedByName: string;
  approvedById?: string;
  approvedByName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}


/** A budget with the spend reconciled against it. */
export interface BudgetHealth extends ExpenseBudget {
  spent: number;
  committed: number;
  remaining: number;
  available: number;
}

/**
 * What the expenses screen consumes, whichever backend is serving it. Both
 * lib/expenses/firebase-expenses.ts and lib/expenses/supabase-expenses.ts return
 * this, so useExpenses can choose between them without the screen knowing.
 */
export interface ExpensesController {
  categories: ExpenseCategory[];
  budgets: ExpenseBudget[];
  expenses: ExpenseRecord[];
  budgetHealth: BudgetHealth[];
  loading: boolean;
  canManage: boolean;
  /** Set when the ledger could not be read, so an empty screen is never mistaken for an empty ledger. */
  error: string | null;
  addCategory: (data: Omit<ExpenseCategory, 'id'>) => Promise<unknown>;
  updateCategory: (id: string, data: Partial<ExpenseCategory>) => Promise<unknown>;
  deleteCategory: (id: string) => Promise<unknown>;
  seedCategories: () => Promise<number>;
  addBudget: (data: Omit<ExpenseBudget, 'id'>) => Promise<unknown>;
  updateBudget: (id: string, data: Partial<ExpenseBudget>) => Promise<unknown>;
  deleteBudget: (id: string) => Promise<unknown>;
  addExpense: (data: Omit<ExpenseRecord, 'id' | 'submittedById' | 'submittedByName'>) => Promise<unknown>;
  updateExpense: (id: string, data: Partial<ExpenseRecord>) => Promise<unknown>;
  reviewExpense: (id: string, status: 'approved' | 'rejected' | 'paid') => Promise<unknown>;
  deleteExpense: (id: string) => Promise<unknown>;
}
