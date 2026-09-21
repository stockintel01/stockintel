import assert from 'node:assert/strict';
import {
  APP_NAME_MAX,
  DEFAULT_APP_BRANDING,
  buildMonogramSvg,
  buildTenantManifest,
  isAllowedIconUrl,
  monogramFor,
  normalizeAppBranding,
  workspaceStartUrl,
} from '../lib/branding/app-branding.ts';

// ── Defaults and fallbacks ───────────────────────────────────────────────────
const fresh = normalizeAppBranding({}, 'Kade Farms');
assert.equal(fresh.appName, 'Kade Farms', 'a farm that has not customized anything still gets its own name');
assert.equal(fresh.shortName, 'Kade');
assert.equal(fresh.themeColor, DEFAULT_APP_BRANDING.themeColor);
assert.equal(fresh.backgroundColor, DEFAULT_APP_BRANDING.backgroundColor);
assert.equal(fresh.iconUrl, '');
assert.equal(normalizeAppBranding({}, '').appName, DEFAULT_APP_BRANDING.appName);
assert.equal(normalizeAppBranding(null, '').appName, DEFAULT_APP_BRANDING.appName);
assert.equal(normalizeAppBranding('nonsense', 'Kade Farms').appName, 'Kade Farms');

const trimmed = normalizeAppBranding({ appName: `  ${'N'.repeat(80)}  `, shortName: 'ExtremelyLongShortName', description: 'x'.repeat(400) });
assert.equal(trimmed.appName.length, APP_NAME_MAX);
assert.equal(trimmed.shortName.length, 12);
assert.equal(trimmed.description.length, 300);
assert.equal(normalizeAppBranding({ appName: 'Multi   word   farm' }).appName, 'Multi word farm', 'whitespace is collapsed');

// ── Colours ──────────────────────────────────────────────────────────────────
assert.equal(normalizeAppBranding({ themeColor: '#AABBCC' }).themeColor, '#aabbcc');
assert.equal(normalizeAppBranding({ themeColor: 'red' }).themeColor, DEFAULT_APP_BRANDING.themeColor);
assert.equal(normalizeAppBranding({ themeColor: '#abc' }).themeColor, DEFAULT_APP_BRANDING.themeColor);
assert.equal(normalizeAppBranding({ backgroundColor: '#000000' }).backgroundColor, '#000000');

// ── Icon URLs ────────────────────────────────────────────────────────────────
assert.equal(isAllowedIconUrl('/logo.svg'), true);
assert.equal(isAllowedIconUrl('https://firebasestorage.googleapis.com/v0/b/x/o/logo.png?alt=media'), true);
assert.equal(isAllowedIconUrl('https://urhngoeszqpaeripatnk.supabase.co/storage/v1/object/public/x.png'), true);
assert.equal(isAllowedIconUrl('https://example.com/logo.png'), false, 'an arbitrary host must not become a farm icon');
assert.equal(isAllowedIconUrl('http://firebasestorage.googleapis.com/logo.png'), false, 'plain http is rejected');
assert.equal(isAllowedIconUrl('//evil.example/logo.png'), false, 'protocol-relative urls are rejected');
assert.equal(isAllowedIconUrl('javascript:alert(1)'), false);
assert.equal(isAllowedIconUrl(''), false);
assert.equal(normalizeAppBranding({ iconUrl: 'https://example.com/logo.png' }).iconUrl, '', 'a rejected icon falls back to the monogram');

// ── Monograms ────────────────────────────────────────────────────────────────
assert.equal(monogramFor('Kade Farms'), 'KF');
assert.equal(monogramFor('StockIntel'), 'S');
assert.equal(monogramFor('kade farms limited'), 'KF');
assert.equal(monogramFor('  '), 'SA');
assert.equal(monogramFor('7 Hills'), '7H');

const svg = buildMonogramSvg(normalizeAppBranding({ appName: 'Kade Farms', themeColor: '#0f766e' }));
assert.ok(svg.startsWith('<svg'), 'the icon route returns a standalone svg');
assert.ok(svg.includes('#0f766e'), 'the tile uses the farm colour');
assert.ok(svg.includes('>KF<'));
assert.ok(svg.includes('rx="96"'), 'the plain icon has rounded corners');
assert.ok(!buildMonogramSvg(normalizeAppBranding({ appName: 'Kade Farms' }), true).includes('rx="96"'), 'a maskable icon is full bleed');

const hostile = buildMonogramSvg(normalizeAppBranding({ appName: '"><script>alert(1)</script>' }));
assert.ok(!hostile.includes('<script>'), 'branding text cannot inject markup into the icon');

// ── Manifest ─────────────────────────────────────────────────────────────────
assert.equal(workspaceStartUrl('org 1'), '/dashboard/agriculture?workspace=org%201');

const manifest = buildTenantManifest(normalizeAppBranding({ appName: 'Kade Farms', themeColor: '#0f766e' }), { organizationId: 'org1' });
assert.equal(manifest.name, 'Kade Farms');
assert.equal(manifest.short_name, 'Kade');
assert.equal(manifest.theme_color, '#0f766e');
assert.equal(manifest.scope, '/');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.id, '/?app=org1', 'the id is what keeps one farm from installing over another');
assert.equal(manifest.start_url, '/dashboard/agriculture?workspace=org1');
assert.deepEqual(manifest.icons, [
  { src: '/api/pwa/icon?org=org1', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
  { src: '/api/pwa/icon?org=org1&purpose=maskable', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
]);

const withLogo = buildTenantManifest(
  normalizeAppBranding({ appName: 'Kade Farms', iconUrl: 'https://firebasestorage.googleapis.com/logo.png' }),
  { organizationId: 'org1' },
);
assert.equal(withLogo.icons[0].src, 'https://firebasestorage.googleapis.com/logo.png');
assert.equal(withLogo.icons[1].purpose, 'maskable', 'a maskable fallback is always offered');

const otherFarm = buildTenantManifest(normalizeAppBranding({}, 'Asuom Estate'), { organizationId: 'org2' });
assert.notEqual(otherFarm.id, manifest.id, 'two farms must never share an app identity');
assert.notEqual(otherFarm.start_url, manifest.start_url);

console.log('Per-farm app branding verified (defaults, colours, icon sources, monograms, manifest identity).');
