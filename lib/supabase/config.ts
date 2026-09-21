export type DataBackend = 'firebase' | 'supabase';

const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

export function isSupabaseConfigured(): boolean {
  return Boolean(publicUrl && publishableKey);
}

export function isSupabaseBackendActive(): boolean {
  return getDataBackend() === 'supabase';
}

export function getSupabasePublicConfig(): { url: string; publishableKey: string } {
  if (!publicUrl || !publishableKey) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.',
    );
  }
  return { url: publicUrl, publishableKey };
}

export function getDataBackend(): DataBackend {
  const backend = process.env.NEXT_PUBLIC_DATA_BACKEND?.trim().toLowerCase() || 'firebase';
  if (backend !== 'firebase' && backend !== 'supabase') {
    throw new Error(`Unsupported NEXT_PUBLIC_DATA_BACKEND value: ${backend}`);
  }
  return backend;
}
