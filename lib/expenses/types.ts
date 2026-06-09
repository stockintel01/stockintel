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

