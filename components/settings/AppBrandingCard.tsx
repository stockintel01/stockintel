'use client';

import { useEffect, useState } from 'react';
import { Loader2, Smartphone } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authenticatedFetch } from '@/lib/api-client';
import {
  APP_NAME_MAX,
  DEFAULT_APP_BRANDING,
  SHORT_NAME_MAX,
  buildMonogramSvg,
  isAllowedIconUrl,
  normalizeAppBranding,
  type AppBranding,
} from '@/lib/branding/app-branding';
import { useAppStore } from '@/lib/store';

function previewSource(branding: AppBranding): string {
  return `data:image/svg+xml,${encodeURIComponent(buildMonogramSvg(branding))}`;
}

/** Lets a farm set the name, colours and icon of its own installed app. */
export function AppBrandingCard() {
  const { user, organization, setStoreUser } = useAppStore();
  const [form, setForm] = useState<AppBranding>(DEFAULT_APP_BRANDING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [unavailable, setUnavailable] = useState('');
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void authenticatedFetch('/api/organizations/branding')
      .then(async response => {
        const body = await response.json().catch(() => ({})) as { branding?: unknown; error?: string };
        if (!response.ok) throw new Error(body.error ?? 'These settings could not be loaded.');
        if (!cancelled) setForm(normalizeAppBranding(body.branding, organization?.name ?? ''));
      })
      .catch((error: unknown) => {
        if (!cancelled) setUnavailable(error instanceof Error ? error.message : 'These settings could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [organization?.name]);

  function update(changes: Partial<AppBranding>) {
    setForm(current => ({ ...current, ...changes }));
    setStatus(null);
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const response = await authenticatedFetch('/api/organizations/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await response.json().catch(() => ({})) as { branding?: unknown; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'The app settings could not be saved.');

      const saved = normalizeAppBranding(body.branding, organization?.name ?? '');
      setForm(saved);
      // Updating the store swaps the manifest link straight away.
      if (user && organization) setStoreUser(user, { ...organization, appBranding: saved });
      setStatus({ kind: 'success', message: 'Saved. Anyone who already installed the app should reinstall it to pick up a new name or icon.' });
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'The app settings could not be saved.' });
    } finally {
      setSaving(false);
    }
  }

  if (unavailable) return null;

  const iconRejected = form.iconUrl.trim().length > 0 && !isAllowedIconUrl(form.iconUrl);
  const previewName = form.appName || organization?.name || DEFAULT_APP_BRANDING.appName;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-green-600" /> Your farm app
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          {organization?.name ?? 'This farm'} installs as its own app. Your team opens the site and chooses Install,
          then it appears on the home screen with the name and icon you set here. Other farms on StockIntel keep theirs.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading your app settings…
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4 rounded-lg border bg-muted/30 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.iconUrl && !iconRejected ? form.iconUrl : previewSource(form)}
                alt=""
                className="h-16 w-16 shrink-0 rounded-2xl border bg-background object-cover"
              />
              <div className="min-w-0">
                <p className="truncate font-semibold">{previewName}</p>
                <p className="truncate text-xs text-muted-foreground">On a home screen: {form.shortName || previewName.slice(0, SHORT_NAME_MAX)}</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="app-name">App name</Label>
                <Input
                  id="app-name"
                  value={form.appName}
                  maxLength={APP_NAME_MAX}
                  placeholder={organization?.name ?? DEFAULT_APP_BRANDING.appName}
                  onChange={event => update({ appName: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="app-short-name">Home screen name</Label>
                <Input
                  id="app-short-name"
                  value={form.shortName}
                  maxLength={SHORT_NAME_MAX}
                  placeholder="Short name"
                  onChange={event => update({ shortName: event.target.value })}
                />
                <p className="text-xs text-muted-foreground">Up to {SHORT_NAME_MAX} characters, so it fits under the icon.</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="app-description">Description</Label>
              <Input
                id="app-description"
                value={form.description}
                onChange={event => update({ description: event.target.value })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="app-theme-color">Brand colour</Label>
                <div className="flex gap-2">
                  <input
                    id="app-theme-color"
                    type="color"
                    value={form.themeColor}
                    onChange={event => update({ themeColor: event.target.value })}
                    className="h-10 w-14 shrink-0 cursor-pointer rounded-md border bg-background p-1"
                    aria-label="Brand colour"
                  />
                  <Input value={form.themeColor} onChange={event => update({ themeColor: event.target.value })} />
                </div>
                <p className="text-xs text-muted-foreground">Used for the icon tile and the browser bar.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="app-background-color">Splash background</Label>
                <div className="flex gap-2">
                  <input
                    id="app-background-color"
                    type="color"
                    value={form.backgroundColor}
                    onChange={event => update({ backgroundColor: event.target.value })}
                    className="h-10 w-14 shrink-0 cursor-pointer rounded-md border bg-background p-1"
                    aria-label="Splash background"
                  />
                  <Input value={form.backgroundColor} onChange={event => update({ backgroundColor: event.target.value })} />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="app-icon-url">Logo address</Label>
              <Input
                id="app-icon-url"
                value={form.iconUrl}
                placeholder="Leave empty to use the lettered tile above"
                onChange={event => update({ iconUrl: event.target.value })}
              />
              {iconRejected ? (
                <p role="alert" className="text-xs text-red-600">
                  Use a logo uploaded to this platform. Addresses on other websites are not accepted, and this one will be ignored when saved.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">A square image works best. Leave it empty and your team sees the lettered tile.</p>
              )}
            </div>

            {status && (
              <p role={status.kind === 'error' ? 'alert' : 'status'} className={status.kind === 'error' ? 'text-sm text-red-600' : 'text-sm text-green-700'}>
                {status.message}
              </p>
            )}

            <Button onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {saving ? 'Saving…' : 'Save app settings'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
