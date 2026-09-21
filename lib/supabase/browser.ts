'use client';

import { createBrowserClient } from '@supabase/ssr';

import { getSupabasePublicConfig } from '@/lib/supabase/config';

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getBrowserSupabaseClient(): ReturnType<typeof createBrowserClient> {
  if (!browserClient) {
    const { url, publishableKey } = getSupabasePublicConfig();
    browserClient = createBrowserClient(url, publishableKey);
  }
  return browserClient;
}
