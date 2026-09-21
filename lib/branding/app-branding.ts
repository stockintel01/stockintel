/**
 * Per-organization app identity. Each farm gets its own installable app: its own
 * name on the home screen, its own colours and icon, and its own start URL so the
 * installed app opens that workspace.
 *
 * Pure and self-contained so the manifest, the settings screen and the tests all
 * agree on what a valid branding record is.
 */

export interface AppBranding {
  version: 1;
  appName: string;
  shortName: string;
  description: string;
  themeColor: string;
  backgroundColor: string;
  iconUrl: string;
}

export const DEFAULT_APP_BRANDING: AppBranding = {
  version: 1,
  appName: 'StockIntel Agri',
  shortName: 'StockIntel',
  description: 'Farm stock, packhouse, livestock, expenses, and team operations.',
  themeColor: '#16a34a',
  backgroundColor: '#ffffff',
  iconUrl: '',
};

export const APP_NAME_MAX = 45;
export const SHORT_NAME_MAX = 12;
export const DESCRIPTION_MAX = 300;

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

// An icon is fetched by the browser and shown as the farm's app. Limiting it to the
// stores this platform uploads to keeps a saved setting from pointing anywhere.
const ICON_HOSTS = new Set(['firebasestorage.googleapis.com', 'lh3.googleusercontent.com']);

export function isAllowedIconUrl(value: string): boolean {
  const candidate = value.trim();
  if (!candidate) return false;
  if (candidate.startsWith('/') && !candidate.startsWith('//')) return true;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:') return false;
    return ICON_HOSTS.has(url.hostname) || url.hostname.endsWith('.supabase.co');
  } catch {
    return false;
  }
}

function text(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength) : '';
}

function colour(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_COLOUR.test(value.trim()) ? value.trim().toLowerCase() : fallback;
}

/** Letters shown when a farm has not uploaded a logo. */
export function monogramFor(name: string): string {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const letters = words.slice(0, 2).map(word => word[0]).join('');
  return (letters || 'SA').toUpperCase().slice(0, 2);
}

export function normalizeAppBranding(input: unknown, organizationName = ''): AppBranding {
  const source = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const farmName = text(organizationName, APP_NAME_MAX);

  const appName = text(source.appName, APP_NAME_MAX) || farmName || DEFAULT_APP_BRANDING.appName;
  const shortName = text(source.shortName, SHORT_NAME_MAX)
    || appName.split(' ')[0].slice(0, SHORT_NAME_MAX)
    || DEFAULT_APP_BRANDING.shortName;
  const iconUrl = text(source.iconUrl, 2000);

  return {
    version: 1,
    appName,
    shortName,
    description: text(source.description, DESCRIPTION_MAX) || DEFAULT_APP_BRANDING.description,
    themeColor: colour(source.themeColor, DEFAULT_APP_BRANDING.themeColor),
    backgroundColor: colour(source.backgroundColor, DEFAULT_APP_BRANDING.backgroundColor),
    iconUrl: isAllowedIconUrl(iconUrl) ? iconUrl : '',
  };
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, character => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character] ?? character
  ));
}

/**
 * A monogram tile drawn from the farm's own colours, so an install looks like the
 * business even before anyone uploads a logo. Maskable icons keep their content
 * inside the centre circle Android crops to.
 */
export function buildMonogramSvg(branding: AppBranding, maskable = false): string {
  const letters = escapeXml(monogramFor(branding.appName));
  const fill = escapeXml(branding.themeColor);
  // A maskable icon is cropped to a circle, so it is drawn full-bleed with smaller letters.
  const tile = maskable
    ? `<rect width="512" height="512" fill="${fill}"/>`
    : `<rect width="512" height="512" rx="96" ry="96" fill="${fill}"/>`;
  const fontSize = maskable ? 190 : 240;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="${letters}">`
    + tile
    + `<text x="256" y="256" fill="#ffffff" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"`
    + ` font-size="${fontSize}" font-weight="700" text-anchor="middle" dominant-baseline="central">${letters}</text>`
    + '</svg>';
}

export interface ManifestOptions {
  organizationId: string;
  /** Where the installed app opens. Carries the workspace so the right farm loads. */
  startPath?: string;
}

export function workspaceStartUrl(organizationId: string, startPath = '/dashboard/agriculture'): string {
  return `${startPath}?workspace=${encodeURIComponent(organizationId)}`;
}

/**
 * Browsers treat two manifests as the same app when their id matches, so the id and
 * start URL both carry the organization. Without that, every farm on the platform
 * would install over the top of the previous one.
 */
export function buildTenantManifest(branding: AppBranding, options: ManifestOptions): Record<string, unknown> {
  const { organizationId } = options;
  const iconQuery = `?org=${encodeURIComponent(organizationId)}`;
  const icons: Array<Record<string, string>> = [];

  if (branding.iconUrl) {
    icons.push({ src: branding.iconUrl, sizes: 'any', purpose: 'any' });
  } else {
    icons.push({ src: `/api/pwa/icon${iconQuery}`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' });
  }
  icons.push({ src: `/api/pwa/icon${iconQuery}&purpose=maskable`, sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' });

  return {
    id: `/?app=${encodeURIComponent(organizationId)}`,
    name: branding.appName,
    short_name: branding.shortName,
    description: branding.description,
    start_url: workspaceStartUrl(organizationId, options.startPath),
    scope: '/',
    display: 'standalone',
    background_color: branding.backgroundColor,
    theme_color: branding.themeColor,
    icons,
  };
}
