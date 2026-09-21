import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { getSupabasePublicConfig } from '@/lib/supabase/config';

let adminClient: ReturnType<typeof createClient> | null = null;

export function getSupabaseAdminClient(): ReturnType<typeof createClient> {
  if (adminClient) return adminClient;

  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error('SUPABASE_SECRET_KEY is required for server-side administrative operations.');
  }

  const { url } = getSupabasePublicConfig();
  adminClient = createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  return adminClient;
}
