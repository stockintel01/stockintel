import 'server-only';

import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

import { getSupabasePublicConfig } from './config';

/**
 * Creates a non-persistent server client that executes database policies and RPCs as
 * the bearer-token user. Use the admin client for trusted reads only; workflow RPCs
 * depend on auth.uid() and therefore must use this client.
 */
export function getSupabaseRequestClient(request: NextRequest) {
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) {
        throw new Error('Authentication required');
    }
    const { url, publishableKey } = getSupabasePublicConfig();
    return createClient(url, publishableKey, {
        global: { headers: { Authorization: authorization } },
        auth: {
            autoRefreshToken: false,
            detectSessionInUrl: false,
            persistSession: false,
        },
    });
}
