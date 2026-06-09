'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc, writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAppStore } from '@/lib/store';
import { EXPENSE_CATEGORY_COLORS, INDUSTRY_EXPENSE_CATEGORIES } from './defaults';
import type { ExpenseBudget, ExpenseCategory, ExpenseRecord } from './types';

function compact<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== ''));
}

export function useExpenses() {
  const { organization, user, activeIndustry } = useAppStore();
  const orgId = organization?.id;
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [budgets, setBudgets] = useState<ExpenseBudget[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const canManage = ['super_admin', 'owner', 'manager'].includes(user?.role ?? '');

  useEffect(() => {
    if (!orgId) return;
    let ready = 0;
    const done = () => {
      ready += 1;
      if (ready === 3) setLoading(false);
    };
    const paths = [
      ['expense_categories', (items: ExpenseCategory[]) => setCategories(items.sort((a, b) => a.name.localeCompare(b.name)))],
      ['expense_budgets', (items: ExpenseBudget[]) => setBudgets(items.sort((a, b) => b.startDate.localeCompare(a.startDate)))],
      ['expenses', (items: ExpenseRecord[]) => setExpenses(items.sort((a, b) => b.date.localeCompare(a.date)))],
    ] as const;
    const unsubs = paths.map(([path, setter]) => onSnapshot(
      collection(db, `organizations/${orgId}/${path}`),
      snap => {
        setter(snap.docs.map(item => ({ id: item.id, ...item.data() })) as never);
        done();
      },
      error => {
        console.error(`Unable to load ${path}`, error);
        done();
      },
    ));
    return () => unsubs.forEach(unsub => unsub());
  }, [orgId]);

  const addCategory = useCallback(async (data: Omit<ExpenseCategory, 'id'>) => {
    if (!orgId) throw new Error('No organization selected.');
    return addDoc(collection(db, `organizations/${orgId}/expense_categories`), compact({ ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  }, [orgId]);

  const updateCategory = useCallback(async (id: string, data: Partial<ExpenseCategory>) => {
    if (!orgId) throw new Error('No organization selected.');
    return updateDoc(doc(db, `organizations/${orgId}/expense_categories/${id}`), compact({ ...data, updatedAt: serverTimestamp() }));
  }, [orgId]);

  const deleteCategory = useCallback(async (id: string) => {
    if (!orgId) throw new Error('No organization selected.');
    if (expenses.some(expense => expense.categoryId === id)) {
      throw new Error('This category has expense history. Archive it instead to preserve your records.');
    }
    return deleteDoc(doc(db, `organizations/${orgId}/expense_categories/${id}`));
  }, [expenses, orgId]);

  const seedCategories = useCallback(async () => {
    if (!orgId) throw new Error('No organization selected.');
    const existing = new Set(categories.map(category => category.name.toLowerCase()));
    const names = INDUSTRY_EXPENSE_CATEGORIES[activeIndustry].filter(name => !existing.has(name.toLowerCase()));
    if (!names.length) return 0;
    const batch = writeBatch(db);
    names.forEach((name, index) => {
      const ref = doc(collection(db, `organizations/${orgId}/expense_categories`));
      batch.set(ref, {
        name, kind: 'operational', color: EXPENSE_CATEGORY_COLORS[index % EXPENSE_CATEGORY_COLORS.length],
        isActive: true, requiresApproval: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
    return names.length;
  }, [activeIndustry, categories, orgId]);

  const addBudget = useCallback(async (data: Omit<ExpenseBudget, 'id'>) => {
    if (!orgId) throw new Error('No organization selected.');
    return addDoc(collection(db, `organizations/${orgId}/expense_budgets`), compact({ ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  }, [orgId]);

  const updateBudget = useCallback(async (id: string, data: Partial<ExpenseBudget>) => {
    if (!orgId) throw new Error('No organization selected.');
    return updateDoc(doc(db, `organizations/${orgId}/expense_budgets/${id}`), compact({ ...data, updatedAt: serverTimestamp() }));
  }, [orgId]);

  const deleteBudget = useCallback(async (id: string) => {
    if (!orgId) throw new Error('No organization selected.');
    if (expenses.some(expense => expense.budgetId === id)) throw new Error('This budget has expense history and cannot be deleted.');
    return deleteDoc(doc(db, `organizations/${orgId}/expense_budgets/${id}`));
  }, [expenses, orgId]);

  const addExpense = useCallback(async (data: Omit<ExpenseRecord, 'id' | 'submittedById' | 'submittedByName'>) => {
    if (!orgId || !user) throw new Error('No organization selected.');
    return addDoc(collection(db, `organizations/${orgId}/expenses`), compact({
      ...data, submittedById: user.id, submittedByName: user.name, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
  }, [orgId, user]);

  const updateExpense = useCallback(async (id: string, data: Partial<ExpenseRecord>) => {
    if (!orgId) throw new Error('No organization selected.');
    return updateDoc(doc(db, `organizations/${orgId}/expenses/${id}`), compact({ ...data, updatedAt: serverTimestamp() }));
  }, [orgId]);

  const reviewExpense = useCallback(async (id: string, status: 'approved' | 'rejected' | 'paid') => {
    if (!orgId || !user) throw new Error('No organization selected.');
    return updateDoc(doc(db, `organizations/${orgId}/expenses/${id}`), {
      status, approvedById: user.id, approvedByName: user.name, updatedAt: serverTimestamp(),
    });
  }, [orgId, user]);

  const deleteExpense = useCallback(async (id: string) => {
    if (!orgId) throw new Error('No organization selected.');
    return deleteDoc(doc(db, `organizations/${orgId}/expenses/${id}`));
  }, [orgId]);

  const budgetHealth = useMemo(() => budgets.map(budget => {
    const matched = expenses.filter(expense => {
      const budgetMatch = expense.budgetId === budget.id || (!expense.budgetId && budget.categoryId && expense.categoryId === budget.categoryId);
      return budgetMatch && expense.date >= budget.startDate && expense.date <= budget.endDate;
    });
    const spent = matched.filter(item => item.status === 'approved' || item.status === 'paid').reduce((sum, item) => sum + item.amount, 0);
    const committed = matched.filter(item => item.status === 'pending').reduce((sum, item) => sum + item.amount, 0);
    return { ...budget, spent, committed, remaining: Math.max(0, budget.amount - spent), available: Math.max(0, budget.amount - spent - committed) };
  }), [budgets, expenses]);

  return {
    categories, budgets, expenses, budgetHealth, loading, canManage,
    addCategory, updateCategory, deleteCategory, seedCategories,
    addBudget, updateBudget, deleteBudget,
    addExpense, updateExpense, reviewExpense, deleteExpense,
  };
}
