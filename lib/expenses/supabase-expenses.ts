'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PostgrestError, RealtimePostgresChangesPayload, SupabaseClient } from '@supabase/supabase-js';

import { useAppStore } from '@/lib/store';
import { getBrowserSupabaseClient } from '@/lib/supabase/browser';
import { computeBudgetHealth } from './budget-health';
import { EXPENSE_CATEGORY_COLORS, INDUSTRY_EXPENSE_CATEGORIES } from './defaults';
import {
  ExpenseWriteError,
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
  type ExpenseBudgetRow,
  type ExpenseCategoryRow,
  type ExpenseRow,
} from './supabase-mapping';
import type { ExpenseBudget, ExpenseCategory, ExpenseRecord, ExpensesController } from './types';

/**
 * The Supabase expense ledger. Selected by lib/expenses/useExpenses.ts, and the
 * pattern the remaining Firestore services follow.
 *
 * Four things differ from a Firestore collection listener and are the reason this
 * file exists at all:
 *
 *  - The Data API returns at most 1000 rows per request, so every list pages.
 *  - Realtime replaces onSnapshot, but it is a change feed, not a query. Messages
 *    missed while the socket was down are never replayed, so the snapshot is re-read
 *    every time the channel reaches SUBSCRIBED, which covers both the first load and
 *    every reconnection.
 *  - Names are joined, not stored. Categories and budgets come from the rows already
 *    loaded; people come from organization_member_directory, because profiles only
 *    exposes the caller's own row to a member who cannot manage the farm.
 *  - Receipts live in a private bucket, so a receipt is a storage path that has to be
 *    signed before it can be opened.
 */

const PAGE_SIZE = 1000;
const RECEIPT_BUCKET = 'expense-receipts';
const RECEIPT_URL_TTL_SECONDS = 3600;

// ReturnType<typeof createBrowserClient> resolves the schema to never once generated
// database types exist, which rejects every write. Rows are typed by the interfaces
// in supabase-mapping.ts instead, the same way lib/comms/server/repository.ts does it.
function db(): SupabaseClient {
  return getBrowserSupabaseClient() as unknown as SupabaseClient;
}

function translate(error: PostgrestError | null, fallback: string): Error {
  if (!error) return new Error(fallback);
  switch (error.code) {
    case '23503':
      return new Error('This record is still referenced by expense history, so it cannot be removed.');
    case '23505':
      return new Error('Another record already uses that name.');
    case '23514':
      return new Error('Those values were rejected. Check the amount and the dates.');
    case '42501':
      return new Error('You do not have permission to change this.');
    default:
      // An RLS refusal on a write arrives as a row-level security message, not a code.
      if (/row-level security/i.test(error.message)) {
        return new Error('You do not have permission to change this.');
      }
      return new Error(error.message || fallback);
  }
}

type Page<T> = { data: T[] | null; error: PostgrestError | null };

async function pageThrough<T>(read: (from: number, to: number) => PromiseLike<Page<T>>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await read(from, from + PAGE_SIZE - 1);
    if (error) throw translate(error, 'The expense ledger could not be read.');
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

/** Applies one realtime change in place, so a single edit does not refetch the ledger. */
function applyChange<T extends { id: string }>(
  setRows: (update: (current: T[]) => T[]) => void,
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
) {
  setRows(current => {
    if (payload.eventType === 'DELETE') {
      // The table replicates its full old row, so the deleted id is present.
      const removed = (payload.old as Partial<T> | null)?.id;
      return removed ? current.filter(row => row.id !== removed) : current;
    }
    const row = payload.new as unknown as T;
    if (!row?.id) return current;
    const index = current.findIndex(item => item.id === row.id);
    if (index === -1) return [...current, row];
    const next = current.slice();
    next[index] = row;
    return next;
  });
}

export function useSupabaseExpenses(): ExpensesController {
  const { organization, user, activeIndustry } = useAppStore();
  const orgId = organization?.id;
  const currency = organization?.currency ?? 'GHS';
  const actorId = user?.id;

  const [categoryRows, setCategoryRows] = useState<ExpenseCategoryRow[]>([]);
  const [budgetRows, setBudgetRows] = useState<ExpenseBudgetRow[]>([]);
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [receiptUrls, setReceiptUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canManage = ['super_admin', 'owner', 'manager'].includes(user?.role ?? '');

  const writeContext = useCallback(() => {
    if (!orgId || !actorId) throw new ExpenseWriteError('No farm is selected.');
    return { organizationId: orgId, actorId, currency };
  }, [actorId, currency, orgId]);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    try {
      const client = db();
      const [categories, budgets, expenses, directory] = await Promise.all([
        pageThrough<ExpenseCategoryRow>((from, to) => client
          .from('expense_categories').select('*').eq('organization_id', orgId).order('name').range(from, to)),
        pageThrough<ExpenseBudgetRow>((from, to) => client
          .from('expense_budgets').select('*').eq('organization_id', orgId)
          .order('start_date', { ascending: false }).range(from, to)),
        pageThrough<ExpenseRow>((from, to) => client
          .from('expenses').select('*').eq('organization_id', orgId).is('archived_at', null)
          .order('expense_date', { ascending: false }).range(from, to)),
        client.rpc('organization_member_directory', { p_organization_id: orgId }),
      ]);

      setCategoryRows(categories);
      setBudgetRows(budgets);
      setExpenseRows(expenses);

      const members = (directory.data ?? []) as { userId: string; displayName: string | null }[];
      setMemberNames(Object.fromEntries(
        members.filter(member => member.displayName).map(member => [member.userId, member.displayName as string]),
      ));
      setError(null);
    } catch (cause) {
      console.error('[expenses] Unable to load the ledger', cause);
      setError(cause instanceof Error ? cause.message : 'The expense ledger could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  // One channel for the three tables. Re-reading on SUBSCRIBED covers the first load
  // and every reconnection, because realtime never replays what it missed.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const client = db();
    const filter = `organization_id=eq.${orgId}`;
    const channel = client
      .channel(`expenses:${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_categories', filter },
        payload => applyChange(setCategoryRows, payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_budgets', filter },
        payload => applyChange(setBudgetRows, payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter },
        payload => applyChange(setExpenseRows, payload))
      .subscribe(status => {
        if (status === 'SUBSCRIBED') void refreshRef.current();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError('Live updates were interrupted. Refresh to see the latest records.');
        }
      });

    return () => {
      void client.removeChannel(channel);
    };
  }, [orgId]);

  // A receipt arriving through realtime has no signed link yet, so unsigned paths are
  // signed as they appear rather than only on a full reload.
  useEffect(() => {
    const missing = Array.from(new Set(expenseRows
      .map(row => row.receipt_storage_path)
      .filter((path): path is string => Boolean(path) && !receiptUrls[path as string])));
    if (!missing.length) return;

    let cancelled = false;
    void db().storage.from(RECEIPT_BUCKET).createSignedUrls(missing, RECEIPT_URL_TTL_SECONDS)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const signed: Record<string, string> = {};
        for (const item of data) {
          if (item.path && item.signedUrl && !item.error) signed[item.path] = item.signedUrl;
        }
        if (Object.keys(signed).length) setReceiptUrls(current => ({ ...current, ...signed }));
      })
      .catch(cause => console.error('[expenses] Unable to sign receipt links', cause));

    return () => {
      cancelled = true;
    };
  }, [expenseRows, receiptUrls]);

  const categories = useMemo(
    () => categoryRows.map(toExpenseCategory).sort((a, b) => a.name.localeCompare(b.name)),
    [categoryRows],
  );

  const lookups = useMemo(() => {
    const categoryNames = new Map(categoryRows.map(row => [row.id, row.name]));
    const budgetNames = new Map(budgetRows.map(row => [row.id, row.name]));
    return {
      categoryName: (id: string) => categoryNames.get(id),
      budgetName: (id: string) => budgetNames.get(id),
      memberName: (id: string) => memberNames[id],
      receiptUrl: (path: string) => receiptUrls[path],
    };
  }, [budgetRows, categoryRows, memberNames, receiptUrls]);

  const budgets = useMemo(
    () => budgetRows.map(row => toExpenseBudget(row, lookups)).sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [budgetRows, lookups],
  );

  const expenses = useMemo(
    () => expenseRows.map(row => toExpenseRecord(row, lookups)).sort((a, b) => b.date.localeCompare(a.date)),
    [expenseRows, lookups],
  );

  const budgetHealth = useMemo(() => computeBudgetHealth(budgets, expenses), [budgets, expenses]);

  const addCategory = useCallback(async (data: Omit<ExpenseCategory, 'id'>) => {
    const { data: row, error: failure } = await db()
      .from('expense_categories').insert(toCategoryInsert(data, writeContext())).select('id').single();
    if (failure) throw translate(failure, 'The category could not be saved.');
    return row;
  }, [writeContext]);

  const updateCategory = useCallback(async (id: string, data: Partial<ExpenseCategory>) => {
    if (!orgId) throw new ExpenseWriteError('No farm is selected.');
    const patch = toCategoryUpdate(data);
    if (!Object.keys(patch).length) return null;
    const { error: failure } = await db()
      .from('expense_categories').update(patch).eq('id', id).eq('organization_id', orgId);
    if (failure) throw translate(failure, 'The category could not be saved.');
    return null;
  }, [orgId]);

  const deleteCategory = useCallback(async (id: string) => {
    if (!orgId) throw new ExpenseWriteError('No farm is selected.');
    if (expenseRows.some(row => row.category_id === id)) {
      throw new Error('This category has expense history. Archive it instead to preserve your records.');
    }
    const { error: failure } = await db()
      .from('expense_categories').delete().eq('id', id).eq('organization_id', orgId);
    if (failure) throw translate(failure, 'The category could not be removed.');
    return null;
  }, [expenseRows, orgId]);

  const seedCategories = useCallback(async () => {
    const context = writeContext();
    const existing = new Set(categoryRows.map(row => row.name.toLowerCase()));
    const names = INDUSTRY_EXPENSE_CATEGORIES[activeIndustry].filter(name => !existing.has(name.toLowerCase()));
    if (!names.length) return 0;

    const rows = names.map((name, index) => toCategoryInsert({
      name,
      kind: 'operational',
      color: EXPENSE_CATEGORY_COLORS[index % EXPENSE_CATEGORY_COLORS.length],
      isActive: true,
      requiresApproval: false,
    }, context));

    // A category the farm already has under a different letter case must not fail the
    // whole batch, so the unique (organization_id, name) pair decides.
    const { data, error: failure } = await db()
      .from('expense_categories')
      .upsert(rows, { onConflict: 'organization_id,name', ignoreDuplicates: true })
      .select('id');
    if (failure) throw translate(failure, 'The starter categories could not be added.');
    return data?.length ?? 0;
  }, [activeIndustry, categoryRows, writeContext]);

  const addBudget = useCallback(async (data: Omit<ExpenseBudget, 'id'>) => {
    const { data: row, error: failure } = await db()
      .from('expense_budgets').insert(toBudgetInsert(data, writeContext())).select('id').single();
    if (failure) throw translate(failure, 'The budget could not be saved.');
    return row;
  }, [writeContext]);

  const updateBudget = useCallback(async (id: string, data: Partial<ExpenseBudget>) => {
    if (!orgId) throw new ExpenseWriteError('No farm is selected.');
    const patch = toBudgetUpdate(data);
    if (!Object.keys(patch).length) return null;
    const { error: failure } = await db()
      .from('expense_budgets').update(patch).eq('id', id).eq('organization_id', orgId);
    if (failure) throw translate(failure, 'The budget could not be saved.');
    return null;
  }, [orgId]);

  const deleteBudget = useCallback(async (id: string) => {
    if (!orgId) throw new ExpenseWriteError('No farm is selected.');
    if (expenseRows.some(row => row.budget_id === id)) {
      throw new Error('This budget has expense history and cannot be deleted.');
    }
    const { error: failure } = await db()
      .from('expense_budgets').delete().eq('id', id).eq('organization_id', orgId);
    if (failure) throw translate(failure, 'The budget could not be removed.');
    return null;
  }, [expenseRows, orgId]);

  const addExpense = useCallback(async (data: Omit<ExpenseRecord, 'id' | 'submittedById' | 'submittedByName'>) => {
    const { data: row, error: failure } = await db()
      .from('expenses').insert(toExpenseInsert(data, writeContext())).select('id').single();
    if (failure) throw translate(failure, 'The expense could not be saved.');
    return row;
  }, [writeContext]);

  const updateExpense = useCallback(async (id: string, data: Partial<ExpenseRecord>) => {
    if (!orgId) throw new ExpenseWriteError('No farm is selected.');
    const patch = toExpenseUpdate(data);
    if (!Object.keys(patch).length) return null;
    const { error: failure } = await db()
      .from('expenses').update(patch).eq('id', id).eq('organization_id', orgId);
    if (failure) throw translate(failure, 'The expense could not be saved.');
    return null;
  }, [orgId]);

  const reviewExpense = useCallback(async (id: string, status: 'approved' | 'rejected' | 'paid') => {
    if (!orgId || !actorId) throw new ExpenseWriteError('No farm is selected.');
    const { error: failure } = await db()
      .from('expenses').update(toReviewUpdate(status, actorId, new Date())).eq('id', id).eq('organization_id', orgId);
    if (failure) throw translate(failure, 'That decision could not be recorded.');
    return null;
  }, [actorId, orgId]);

  const deleteExpense = useCallback(async (id: string) => {
    if (!orgId) throw new ExpenseWriteError('No farm is selected.');
    const { error: failure } = await db()
      .from('expenses').delete().eq('id', id).eq('organization_id', orgId);
    if (failure) throw translate(failure, 'The expense could not be removed.');
    return null;
  }, [orgId]);

  return {
    categories, budgets, expenses, budgetHealth, loading, canManage, error,
    addCategory, updateCategory, deleteCategory, seedCategories,
    addBudget, updateBudget, deleteBudget,
    addExpense, updateExpense, reviewExpense, deleteExpense,
  };
}
