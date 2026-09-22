'use client';

import { isSupabaseBackendActive } from '@/lib/supabase/config';
import { useFirebaseExpenses } from './firebase-expenses';
import { useSupabaseExpenses } from './supabase-expenses';
import type { ExpensesController } from './types';

/**
 * The expense ledger, served by whichever backend NEXT_PUBLIC_DATA_BACKEND names.
 *
 * The choice is made once at module load from a build-time value, so the hook order
 * is fixed for the life of the page. Both implementations are imported on purpose:
 * the cutover plan keeps Firebase available through the rollback window, and flipping
 * the flag back has to be a redeploy of the same build, not a code change.
 */
const useExpensesForBackend = isSupabaseBackendActive() ? useSupabaseExpenses : useFirebaseExpenses;

export function useExpenses(): ExpensesController {
  return useExpensesForBackend();
}
