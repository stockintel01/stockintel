import { NextRequest, NextResponse } from 'next/server';

import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Completes a Supabase OAuth sign-in. The provider sends the browser back here with a
 * one-time code, which is exchanged for a session and stored in cookies.
 *
 * Firebase remains the active sign-in path until NEXT_PUBLIC_DATA_BACKEND is supabase;
 * this route is what makes the Supabase path possible at all.
 */
function loginRedirect(origin: string, message: string) {
  return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);
}

/** Only same-site paths, so a crafted link cannot bounce someone to another host. */
function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard';
  return value;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  if (!isSupabaseConfigured()) {
    return loginRedirect(origin, 'Supabase sign-in is not configured for this deployment.');
  }

  const providerError = searchParams.get('error_description') ?? searchParams.get('error');
  if (providerError) return loginRedirect(origin, providerError);

  const code = searchParams.get('code');
  if (!code) return loginRedirect(origin, 'That sign-in link is incomplete. Try signing in again.');

  const next = safeNextPath(searchParams.get('next'));

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return loginRedirect(origin, error.message);

    // An account with no farm is on its way to creating one, so it starts at
    // onboarding rather than an empty dashboard. An invitation is the exception: the
    // membership arrives when /join accepts it.
    if (next === '/dashboard' && data.user) {
      const { count } = await supabase
        .from('organization_memberships')
        .select('organization_id', { count: 'exact', head: true })
        .eq('user_id', data.user.id)
        .eq('active', true);
      if (!count) return NextResponse.redirect(`${origin}/onboarding`);
    }
  } catch (error) {
    console.error('[auth] Supabase code exchange failed:', error);
    return loginRedirect(origin, 'Sign-in could not be completed. Try again.');
  }

  return NextResponse.redirect(`${origin}${next}`);
}
