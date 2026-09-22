'use client';

import { auth } from '@/lib/firebase';
import { getBrowserSupabaseClient } from '@/lib/supabase/browser';
import { isSupabaseBackendActive } from '@/lib/supabase/config';

/**
 * Sends the bearer token the server is expecting for the active backend.
 *
 * `forceRefresh` only means anything to Firebase, whose ID token is refreshed on
 * demand. Supabase refreshes its access token on its own as it nears expiry, so
 * frequent callers pay nothing for asking.
 */
async function bearerToken(forceRefresh: boolean): Promise<string> {
    if (isSupabaseBackendActive()) {
        const { data, error } = await getBrowserSupabaseClient().auth.getSession();
        if (error) throw new Error(error.message);
        const token = data.session?.access_token;
        if (!token) throw new Error('Authentication required');
        return token;
    }

    const user = auth.currentUser;
    if (!user) throw new Error('Authentication required');
    return user.getIdToken(forceRefresh);
}

/**
 * Pass `forceRefresh: false` for frequent requests such as polling; the cached ID
 * token is refreshed automatically when it nears expiry.
 */
export async function authenticatedFetch(
    input: RequestInfo | URL,
    init: RequestInit = {},
    options: { forceRefresh?: boolean } = {},
) {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${await bearerToken(options.forceRefresh ?? true)}`);

    return fetch(input, { ...init, headers });
}
