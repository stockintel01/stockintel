'use client';

import { getBrowserSupabaseClient } from '@/lib/supabase/browser';

/**
 * Client half of the Supabase sign-in path. The redirect lands on /auth/callback,
 * which exchanges the code for a session.
 *
 * AuthContext still signs in through Firebase; these helpers are what it will call
 * once NEXT_PUBLIC_DATA_BACKEND moves to supabase.
 */
export async function signInWithGoogle(next = '/dashboard'): Promise<void> {
  const path = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(path)}`;

  const { error } = await getBrowserSupabaseClient().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  const { error } = await getBrowserSupabaseClient().auth.signOut();
  if (error) throw new Error(error.message);
}

export async function getCurrentUser() {
  const { data, error } = await getBrowserSupabaseClient().auth.getUser();
  if (error) return null;
  return data.user;
}
