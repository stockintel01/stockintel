'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js';

import { useAppStore } from '@/lib/store';
import { getBrowserSupabaseClient } from '@/lib/supabase/browser';
import { describeAuthError } from '@/lib/supabase/session-mapping';
import { loadWorkspaceSession, provisionWorkspace } from '@/lib/supabase/workspace-session';
import {
  AuthContext,
  AuthGate,
  isGatedRoute,
  type AuthIdentity,
  type SignUpInput,
} from './auth-shared';

/**
 * Supabase sign-in. Mirrors the Firebase provider's contract exactly; what differs is
 * everything underneath:
 *
 *  - Google is a full-page redirect, not a popup, so the browser leaves this page and
 *    comes back through /auth/callback. Nothing after that call runs.
 *  - The session arrives before the workspace is known, so the identity and the
 *    workspace load in two steps. Supabase warns against calling the client from
 *    inside onAuthStateChange, so the listener only records who signed in and a
 *    separate effect reads their farm.
 *  - A brand-new account has no farm. This is the one place that creates one, so the
 *    Google redirect, an email sign-up and a confirmation link all land in the same
 *    path. An invitation is the exception: /join assigns the membership itself, and a
 *    farm created here would leave the invitee owning an empty one.
 */

function identityOf(user: SupabaseUser | null | undefined): AuthIdentity | null {
  if (!user) return null;
  const metadata = user.user_metadata ?? {};
  const email = user.email ?? '';
  return {
    id: user.id,
    email,
    name: String(metadata.full_name || metadata.name || '') || email.split('@')[0] || 'User',
    photoURL: String(metadata.avatar_url || metadata.picture || ''),
  };
}

function safeNextPath(path: string): string {
  return path.startsWith('/') && !path.startsWith('//') ? path : '/dashboard';
}

// Without generated schema types the client's own generics resolve to implicit any,
// so it is cast once here rather than at every call, as the data layer does.
function client(): SupabaseClient {
  return getBrowserSupabaseClient() as unknown as SupabaseClient;
}

export function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [identity, setIdentity] = useState<AuthIdentity | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  const setStoreUser = useAppStore(state => state.setStoreUser);
  const setAuthenticated = useAppStore(state => state.setAuthenticated);

  // An invitation assigns the membership, so this session must not create a farm.
  const acceptingInvitation = pathname.startsWith('/join');
  const acceptingInvitationRef = useRef(acceptingInvitation);
  acceptingInvitationRef.current = acceptingInvitation;

  useEffect(() => {
    const supabase = client();
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setIdentity(identityOf(data.session?.user));
      setSessionChecked(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active || event === 'TOKEN_REFRESHED') return;
      setIdentity(identityOf(session?.user));
      setSessionChecked(true);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const identityId = identity?.id ?? null;
  const identityEmail = identity?.email ?? '';

  useEffect(() => {
    if (!sessionChecked) return;
    if (!identityId) {
      setStoreUser(null, null);
      setAuthenticated(false);
      setAuthReady(true);
      return;
    }

    let cancelled = false;
    setAuthReady(false);

    void (async () => {
      try {
        let session = await loadWorkspaceSession({
          id: identityId,
          email: identityEmail,
          name: identity?.name ?? '',
          photoURL: identity?.photoURL ?? '',
        });

        if (session.needsWorkspace && !acceptingInvitationRef.current) {
          await provisionWorkspace({ ownerId: identityId });
          if (cancelled) return;
          session = await loadWorkspaceSession({
            id: identityId,
            email: identityEmail,
            name: identity?.name ?? '',
            photoURL: identity?.photoURL ?? '',
          });
        }

        if (cancelled) return;
        setStoreUser(session.user, session.organization);
        setAuthenticated(true);
      } catch (error) {
        console.error('[AuthContext] workspace load error:', error);
        // Fail closed. A Supabase session whose workspace cannot be read must not be
        // treated as a signed-in member.
        if (!cancelled) {
          setStoreUser(null, null);
          setAuthenticated(false);
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // identity's other fields only ever change alongside the id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityId, identityEmail, sessionChecked, setStoreUser, setAuthenticated]);

  const signInWithGoogle = useCallback(async (referrerCode?: string, options?: { deferProvisioning?: boolean }) => {
    // The invitation page asks for no provisioning; carrying that through the redirect
    // is what /join does by being the page the browser returns to.
    const next = safeNextPath(options?.deferProvisioning ? `${window.location.pathname}${window.location.search}` : '/dashboard');
    const redirectTo = new URL('/auth/callback', window.location.origin);
    redirectTo.searchParams.set('next', next);
    if (referrerCode) redirectTo.searchParams.set('ref', referrerCode);

    const { error } = await client().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectTo.toString() },
    });
    if (error) throw new Error(error.message);
    // The browser is leaving this page; the result arrives at /auth/callback.
    return { isNewUser: false, email: null };
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await client().auth
      .signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(error.message);
  }, []);

  const signUpWithEmail = useCallback(async ({ name, email, password, referrerCode }: SignUpInput) => {
    const { data, error } = await client().auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: name.trim(), ...(referrerCode ? { referred_by_code: referrerCode } : {}) },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Fonboarding`,
      },
    });
    if (error) throw new Error(error.message);

    // With email confirmation on, sign-up returns a user but no session. The farm is
    // created when they come back with one, not now.
    return { isNewUser: true, needsEmailConfirmation: !data.session };
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const { error } = await client().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=%2Fdashboard`,
    });
    if (error) throw new Error(error.message);
  }, []);

  const logout = useCallback(async () => {
    try {
      const { error } = await client().auth.signOut();
      if (error) throw new Error(error.message);
      navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_CACHES' });
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user: identity,
      loading: !authReady,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      sendPasswordReset,
      logout,
      describeError: describeAuthError,
    }}>
      <AuthGate ready={authReady} gated={isGatedRoute(pathname)}>{children}</AuthGate>
    </AuthContext.Provider>
  );
}
