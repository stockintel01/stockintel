'use client';

import { auth } from '@/lib/firebase';

/**
 * Pass `forceRefresh: false` for frequent requests such as polling; the cached ID
 * token is refreshed automatically when it nears expiry.
 */
export async function authenticatedFetch(
    input: RequestInfo | URL,
    init: RequestInit = {},
    options: { forceRefresh?: boolean } = {},
) {
    const user = auth.currentUser;
    if (!user) throw new Error('Authentication required');

    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${await user.getIdToken(options.forceRefresh ?? true)}`);

    return fetch(input, { ...init, headers });
}
