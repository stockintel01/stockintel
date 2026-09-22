'use client';

import { isSupabaseBackendActive } from '@/lib/supabase/config';
import { FirebaseAuthProvider } from './firebase-auth-provider';
import { SupabaseAuthProvider } from './supabase-auth-provider';

export { useAuth } from './auth-shared';
export type { AuthContextType, AuthIdentity, SignUpInput, SignUpResult } from './auth-shared';

/**
 * Signs people in through whichever backend NEXT_PUBLIC_DATA_BACKEND names.
 *
 * The choice is made once from a build-time value, so a session never changes provider
 * underneath a running page, and rolling back stays a redeploy of the same build.
 * Both providers put the same shape into the store, so no screen below here knows
 * which one signed the member in.
 */
export const AuthProvider = isSupabaseBackendActive() ? SupabaseAuthProvider : FirebaseAuthProvider;
