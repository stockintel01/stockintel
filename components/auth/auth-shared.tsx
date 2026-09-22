'use client';

import { createContext, useContext } from 'react';

/**
 * The sign-in contract both backends implement.
 *
 * Deliberately carries no Firebase or Supabase type: the screens that sign people in
 * must not know which one is serving them, which is what lets the backend flag be a
 * redeploy rather than a rewrite.
 */
export interface AuthIdentity {
  id: string;
  email: string;
  name: string;
  photoURL: string;
}

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
  referrerCode?: string;
}

export interface SignUpResult {
  isNewUser: boolean;
  /** Supabase can require a confirmation link before a session exists. */
  needsEmailConfirmation: boolean;
}

export interface GoogleSignInResult {
  isNewUser: boolean;
  /** Null when the browser is being redirected and the result lands on another page. */
  email: string | null;
}

export interface AuthContextType {
  user: AuthIdentity | null;
  loading: boolean;
  signInWithGoogle: (referrerCode?: string, options?: { deferProvisioning?: boolean }) => Promise<GoogleSignInResult>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (input: SignUpInput) => Promise<SignUpResult>;
  sendPasswordReset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Turns a backend's own error into something a person can act on. */
  describeError: (error: unknown) => string;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signInWithGoogle: async () => ({ isNewUser: false, email: null }),
  signInWithEmail: async () => {},
  signUpWithEmail: async () => ({ isNewUser: false, needsEmailConfirmation: false }),
  sendPasswordReset: async () => {},
  logout: async () => {},
  describeError: error => (error instanceof Error ? error.message : 'Something went wrong. Please try again.'),
});

export const useAuth = () => useContext(AuthContext);

/**
 * Holds back only the screens that assume a signed-in user. The landing page once
 * prerendered as nothing but this spinner, which is what every first-time visitor and
 * link preview saw.
 */
export function AuthGate({ ready, gated, children }: { ready: boolean; gated: boolean; children: React.ReactNode }) {
  if (ready || !gated) return <>{children}</>;
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center font-black text-primary-foreground text-base">SI</div>
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}

/** Both providers gate the same routes. */
export function isGatedRoute(pathname: string): boolean {
  return pathname.startsWith('/dashboard') || pathname.startsWith('/onboarding');
}
