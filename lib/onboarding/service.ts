'use client';

import { isSupabaseBackendActive } from '@/lib/supabase/config';
import { firebaseOnboarding } from './firebase-onboarding';
import { supabaseOnboarding } from './supabase-onboarding';
import type { OnboardingService } from './mapping';

/**
 * The three writes onboarding makes, against whichever backend is active. Chosen once
 * from a build-time value, like the expense ledger and the sign-in providers.
 */
export const onboardingService: OnboardingService = isSupabaseBackendActive()
  ? supabaseOnboarding
  : firebaseOnboarding;

export type { BusinessProfile, InviteOutcome, OnboardingService, TeamInvite } from './mapping';
