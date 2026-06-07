'use client';

import { auth } from '@/lib/firebase';

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
    const user = auth.currentUser;
    if (!user) throw new Error('Authentication required');

    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${await user.getIdToken()}`);

    return fetch(input, { ...init, headers });
}
