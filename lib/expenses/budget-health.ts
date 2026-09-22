import type { BudgetHealth, ExpenseBudget, ExpenseRecord } from './types';

/**
 * Reconciles spend against each budget. Shared so the two backends cannot drift into
 * reporting different numbers for the same farm.
 *
 * An expense counts against a budget when it names it, or when it has no budget of
 * its own and falls in the category the budget covers. Approved and paid money is
 * spent; pending money is committed but still recoverable.
 */
export function computeBudgetHealth(budgets: ExpenseBudget[], expenses: ExpenseRecord[]): BudgetHealth[] {
  return budgets.map(budget => {
    const matched = expenses.filter(expense => {
      const budgetMatch = expense.budgetId === budget.id
        || (!expense.budgetId && budget.categoryId && expense.categoryId === budget.categoryId);
      return budgetMatch && expense.date >= budget.startDate && expense.date <= budget.endDate;
    });
    const spent = matched
      .filter(item => item.status === 'approved' || item.status === 'paid')
      .reduce((sum, item) => sum + item.amount, 0);
    const committed = matched
      .filter(item => item.status === 'pending')
      .reduce((sum, item) => sum + item.amount, 0);
    return {
      ...budget,
      spent,
      committed,
      remaining: Math.max(0, budget.amount - spent),
      available: Math.max(0, budget.amount - spent - committed),
    };
  });
}
