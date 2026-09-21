'use client';

import { useEffect } from 'react';

import { normalizeAppBranding } from '@/lib/branding/app-branding';
import { useAppStore } from '@/lib/store';

const PLATFORM_MANIFEST = '/manifest.json';

function upsertLink(rel: string, href: string) {
  let link = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    document.head.appendChild(link);
  }
  link.href = href;
}

function upsertMeta(name: string, content: string) {
  let meta = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = name;
    document.head.appendChild(meta);
  }
  meta.content = content;
}

/**
 * Points the browser at the signed-in farm's own manifest, so installing from this
 * workspace installs that farm's app: its name, its colours, its icon, and a start
 * URL that reopens this workspace.
 */
export function TenantAppManifest() {
  const organization = useAppStore(state => state.organization);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    if (!organization?.id) {
      upsertLink('manifest', PLATFORM_MANIFEST);
      return;
    }

    const query = `org=${encodeURIComponent(organization.id)}`;
    const branding = normalizeAppBranding(organization.appBranding, organization.name);
    upsertLink('manifest', `/api/pwa/manifest?${query}`);
    // iOS ignores manifest icons and uses this link for the home-screen icon.
    upsertLink('apple-touch-icon', branding.iconUrl || `/api/pwa/icon?${query}`);
    upsertMeta('theme-color', branding.themeColor);
    upsertMeta('application-name', branding.appName);
    upsertMeta('apple-mobile-web-app-title', branding.shortName);
  }, [organization]);

  return null;
}
