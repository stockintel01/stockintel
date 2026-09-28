'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, BadgeCheck, Building2, Check, CloudUpload, FileText,
  ImagePlus, Loader2, Palette, Printer, ReceiptText, RotateCcw,
  Save, Settings2, ShieldCheck, Smartphone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isSuperAdminEmail } from '@/lib/access-control';
import { saveReceiptDesign, uploadReceiptLogo } from '@/lib/settings/workspace-settings';
import {
  buildSalesReceiptHtml, DEFAULT_SALES_RECEIPT_SETTINGS,
  normalizeSalesReceiptSettings, printSalesReceipt,
  SALES_RECEIPT_CURRENCIES, SALES_RECEIPT_LOCALES,
  type SalesReceiptData, type SalesReceiptSettings, type SalesReceiptTemplate,
} from '@/lib/sales/receipt';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const TEMPLATE_OPTIONS: Array<{ value: SalesReceiptTemplate; label: string; description: string; icon: typeof ReceiptText }> = [
  { value: 'modern', label: 'Modern', description: 'Polished brand-led layout for customer receipts.', icon: ReceiptText },
  { value: 'classic', label: 'Classic', description: 'Formal, restrained document for business buyers.', icon: FileText },
  { value: 'compact', label: 'Compact', description: 'Space-efficient layout for 80 mm printers.', icon: Smartphone },
];

const PREVIEW_SALE: SalesReceiptData = {
  receiptNumber: 'REC-20260904-A7K2P9', issuedAt: '2026-09-04',
  customerName: 'Green Valley Foods', customerContact: '+233 20 000 0000',
  customerAddress: 'Accra, Ghana', sellerName: 'Sales desk',
  paymentMethod: 'Bank transfer', paymentStatus: 'paid', reference: 'PO-1048', taxRate: 0,
  items: [
    { description: 'Premium Grade A eggs', quantity: 24, unit: 'trays', unitPrice: 42 },
    { description: 'Fresh produce box', quantity: 8, unit: 'boxes', unitPrice: 65 },
  ],
  notes: 'Produce inspected and accepted at dispatch.',
};

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}{hint ? <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}</div>;
}

function ToggleRow({ checked, onChange, title, description }: { checked: boolean; onChange: (checked: boolean) => void; title: string; description: string }) {
  return <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/40"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-green-700" checked={checked} onChange={event => onChange(event.target.checked)} /><span><span className="block text-sm font-semibold">{title}</span><span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{description}</span></span></label>;
}

export default function ReceiptDesignerPage() {
  const { organization, user, receiptSettings, updateReceiptSettings, setStoreUser } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<SalesReceiptSettings>(() => normalizeSalesReceiptSettings(receiptSettings, organization ?? undefined, user?.email));
  const [savedSettings, setSavedSettings] = useState(settings);
  const [mobileView, setMobileView] = useState<'design' | 'preview'>('design');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);
  const canDesign = user?.role === 'owner' || isSuperAdminEmail(user?.email);
  const dirty = JSON.stringify(settings) !== JSON.stringify(savedSettings);
  const draftKey = organization?.id ? `stockintel:receipt-designer:v1:${organization.id}` : '';

  useEffect(() => {
    if (!organization?.id) return;
    const persisted = normalizeSalesReceiptSettings(organization.receiptSettings, organization, user?.email);
    let initial = persisted;
    try {
      const draft = localStorage.getItem(`stockintel:receipt-designer:v1:${organization.id}`);
      if (draft) initial = normalizeSalesReceiptSettings(JSON.parse(draft), organization, user?.email);
    } catch {
      localStorage.removeItem(`stockintel:receipt-designer:v1:${organization.id}`);
    }
    setSettings(initial);
    setSavedSettings(persisted);
    setMessage(JSON.stringify(initial) !== JSON.stringify(persisted) ? { tone: 'info', text: 'Your unsaved design draft was restored for this workspace.' } : null);
  }, [organization, user?.email]);

  useEffect(() => {
    if (!draftKey || !canDesign) return;
    if (dirty) localStorage.setItem(draftKey, JSON.stringify(settings));
    else localStorage.removeItem(draftKey);
  }, [canDesign, dirty, draftKey, settings]);

  const previewData = useMemo<SalesReceiptData>(() => ({
    ...PREVIEW_SALE,
    receiptNumber: `${settings.receiptPrefix}-20260904-A7K2P9`,
    currencyCode: settings.currencyCode,
    taxRate: settings.showTax ? settings.defaultTaxRate : 0,
  }), [settings.currencyCode, settings.defaultTaxRate, settings.receiptPrefix, settings.showTax]);
  const previewHtml = useMemo(() => buildSalesReceiptHtml(settings, previewData), [previewData, settings]);

  function update<K extends keyof SalesReceiptSettings>(key: K, value: SalesReceiptSettings[K]) {
    setSettings(current => ({ ...current, [key]: value }));
    setMessage(null);
  }

  function chooseTemplate(template: SalesReceiptTemplate) {
    setSettings(current => ({ ...current, template, paperSize: template === 'compact' ? '80mm' : current.paperSize === '80mm' ? 'a4' : current.paperSize }));
    setMessage(null);
  }

  async function uploadLogo(file?: File) {
    if (!file || !organization?.id || !canDesign) return;
    if (!ALLOWED_LOGO_TYPES.has(file.type)) {
      setMessage({ tone: 'error', text: 'Use a PNG, JPG, or WebP logo. SVG files are not accepted for customer-document safety.' });
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setMessage({ tone: 'error', text: 'The logo must be 2 MB or smaller.' });
      return;
    }
    setUploading(true);
    setMessage(null);
    try {
      const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const logoUrl = await uploadReceiptLogo(organization.id, file, extension);
      setSettings(current => ({ ...current, logoUrl, showLogo: true }));
      setMessage({ tone: 'info', text: 'Logo uploaded. Save the design to publish it to customer receipts.' });
    } catch (error) {
      console.error('[receipt designer] logo upload failed:', error);
      setMessage({ tone: 'error', text: 'Logo upload failed. Check the connection and storage permissions.' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function saveDesign() {
    if (!organization?.id || !user || !canDesign) return;
    const normalized = normalizeSalesReceiptSettings(settings, organization, user.email);
    if (!normalized.businessName) {
      setMessage({ tone: 'error', text: 'Enter the business name that customers should see.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await saveReceiptDesign(organization.id, normalized);
      updateReceiptSettings(normalized);
      setStoreUser(user, { ...organization, receiptSettings: normalized });
      setSettings(normalized);
      setSavedSettings(normalized);
      if (draftKey) localStorage.removeItem(draftKey);
      setMessage({ tone: 'success', text: navigator.onLine ? 'Sales receipt design published for this workspace.' : 'Design saved offline. It will publish automatically when this device reconnects.' });
    } catch (error) {
      console.error('[receipt designer] save failed:', error);
      setMessage({ tone: 'error', text: 'The design could not be saved. Check your connection and owner permissions.' });
    } finally {
      setSaving(false);
    }
  }

  function resetDesign() {
    if (!organization) return;
    const reset = normalizeSalesReceiptSettings({ ...DEFAULT_SALES_RECEIPT_SETTINGS, businessName: organization.name, address: organization.address, phone: organization.phone, taxId: organization.taxId, currencyCode: organization.currency, email: user?.email }, organization, user?.email);
    setSettings(reset);
    setMessage({ tone: 'info', text: 'Standard design restored locally. Save to publish it.' });
  }

  function testPrint() {
    if (!printSalesReceipt(settings, previewData)) setMessage({ tone: 'error', text: 'The print preview was blocked. Allow pop-ups for this site and try again.' });
  }

  if (!organization) {
    return <Card className="mx-auto max-w-xl"><CardContent className="py-12 text-center"><Building2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" /><h1 className="text-xl font-bold">Select a workspace</h1><p className="mt-2 text-sm text-muted-foreground">Receipt branding belongs to a tenant workspace. Select one before opening the designer.</p></CardContent></Card>;
  }

  if (!canDesign) {
    return <Card className="mx-auto max-w-xl"><CardContent className="py-12 text-center"><ShieldCheck className="mx-auto mb-3 h-10 w-10 text-amber-600" /><h1 className="text-xl font-bold">Owner-controlled branding</h1><p className="mt-2 text-sm text-muted-foreground">Only the workspace owner can change customer receipt branding, currency, tax presentation, and legal text. Your existing operational access is unchanged.</p><Link href="/dashboard/settings"><Button variant="outline" className="mt-5">Back to settings</Button></Link></CardContent></Card>;
  }

  return <div className="mx-auto max-w-[1500px] space-y-5">
    <header className="flex flex-col gap-4 rounded-2xl border bg-gradient-to-br from-emerald-950 to-emerald-800 p-5 text-white shadow-sm sm:p-7 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl"><Link href="/dashboard/settings" className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-emerald-100 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" />Workspace settings</Link><div className="flex items-start gap-3"><div className="rounded-xl bg-white/10 p-2.5"><ReceiptText className="h-6 w-6" /></div><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">Customer sales documents</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Receipt Designer</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-emerald-50/80">Create the receipt customers receive when your organization sells produce, eggs, livestock, or other farm goods. The published design belongs only to {organization.name}.</p></div></div></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={testPrint}><Printer className="mr-2 h-4 w-4" />Test print</Button><Button className="bg-white text-emerald-950 hover:bg-emerald-50" disabled={saving || !dirty} onClick={() => void saveDesign()}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{saving ? 'Publishing...' : dirty ? 'Save and publish' : 'Published'}</Button></div>
    </header>

    {message ? <div role="status" className={cn('rounded-xl border px-4 py-3 text-sm', message.tone === 'success' && 'border-green-200 bg-green-50 text-green-800', message.tone === 'error' && 'border-red-200 bg-red-50 text-red-800', message.tone === 'info' && 'border-blue-200 bg-blue-50 text-blue-800')}>{message.text}</div> : null}

    <div className="sticky top-16 z-30 grid grid-cols-2 rounded-xl border bg-background/95 p-1 shadow-sm backdrop-blur lg:hidden"><button type="button" className={cn('rounded-lg px-3 py-2 text-sm font-semibold', mobileView === 'design' ? 'bg-emerald-700 text-white' : 'text-muted-foreground')} onClick={() => setMobileView('design')}>Design</button><button type="button" className={cn('rounded-lg px-3 py-2 text-sm font-semibold', mobileView === 'preview' ? 'bg-emerald-700 text-white' : 'text-muted-foreground')} onClick={() => setMobileView('preview')}>Live preview</button></div>

    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
      <section className={cn('space-y-5', mobileView !== 'design' && 'hidden lg:block')}>
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Palette className="h-5 w-5 text-emerald-700" />Layout and brand</CardTitle></CardHeader><CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">{TEMPLATE_OPTIONS.map(option => <button type="button" key={option.value} onClick={() => chooseTemplate(option.value)} className={cn('rounded-xl border-2 p-3 text-left transition-all hover:border-emerald-300 hover:bg-emerald-50/40', settings.template === option.value ? 'border-emerald-700 bg-emerald-50' : 'border-muted')}><div className="flex items-center justify-between"><option.icon className="h-5 w-5 text-emerald-700" />{settings.template === option.value ? <Check className="h-4 w-4 text-emerald-700" /> : null}</div><p className="mt-3 text-sm font-bold">{option.label}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{option.description}</p></button>)}</div>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Paper size"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={settings.paperSize} onChange={event => update('paperSize', event.target.value as SalesReceiptSettings['paperSize'])}><option value="a4">A4 document</option><option value="letter">US Letter</option><option value="80mm">80 mm thermal roll</option></select></Field><Field label="Receipt heading"><Input value={settings.documentTitle} maxLength={40} onChange={event => update('documentTitle', event.target.value)} /></Field></div>
          <div className="rounded-xl border bg-muted/20 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-white text-emerald-700"><ImagePlus className="h-6 w-6" /></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">Organization logo</p><p className="text-xs text-muted-foreground">PNG, JPG, or WebP. Maximum 2 MB. A square or wide transparent logo works best.</p>{settings.logoUrl ? <p className="mt-1 truncate text-xs text-emerald-700">Logo ready</p> : null}</div><input ref={fileInputRef} className="hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void uploadLogo(event.target.files?.[0])} /><Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => fileInputRef.current?.click()}>{uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CloudUpload className="mr-2 h-4 w-4" />}{uploading ? 'Uploading...' : settings.logoUrl ? 'Replace' : 'Upload'}</Button></div>{settings.logoUrl ? <div className="mt-3 flex gap-2"><Button type="button" size="sm" variant="ghost" onClick={() => update('showLogo', !settings.showLogo)}>{settings.showLogo ? 'Hide on receipt' : 'Show on receipt'}</Button><Button type="button" size="sm" variant="ghost" className="text-red-700" onClick={() => setSettings(current => ({ ...current, logoUrl: '', showLogo: false }))}>Remove</Button></div> : null}</div>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Primary color"><div className="flex gap-2"><Input type="color" className="w-14 p-1" value={settings.primaryColor} onChange={event => update('primaryColor', event.target.value)} /><Input value={settings.primaryColor} maxLength={7} onChange={event => update('primaryColor', event.target.value)} /></div></Field><Field label="Accent color"><div className="flex gap-2"><Input type="color" className="w-14 p-1" value={settings.accentColor} onChange={event => update('accentColor', event.target.value)} /><Input value={settings.accentColor} maxLength={7} onChange={event => update('accentColor', event.target.value)} /></div></Field></div>
        </CardContent></Card>

        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Building2 className="h-5 w-5 text-emerald-700" />Business identity</CardTitle></CardHeader><CardContent className="space-y-4"><Field label="Business / trading name"><Input value={settings.businessName} maxLength={100} onChange={event => update('businessName', event.target.value)} /></Field><Field label="Tagline"><Input value={settings.tagline} maxLength={120} onChange={event => update('tagline', event.target.value)} placeholder="Short customer-facing promise" /></Field><Field label="Business address"><textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" value={settings.address} maxLength={240} onChange={event => update('address', event.target.value)} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Phone"><Input value={settings.phone} maxLength={40} onChange={event => update('phone', event.target.value)} /></Field><Field label="Email"><Input type="email" value={settings.email} maxLength={120} onChange={event => update('email', event.target.value)} /></Field><Field label="Website"><Input type="url" value={settings.website} maxLength={160} onChange={event => update('website', event.target.value)} placeholder="https://example.com" /></Field><Field label={settings.taxLabel || 'Tax ID'}><Input value={settings.taxId} maxLength={60} onChange={event => update('taxId', event.target.value)} /></Field><Field label="Tax identifier label"><Input value={settings.taxLabel} maxLength={30} onChange={event => update('taxLabel', event.target.value)} placeholder="Tax ID, VAT, TIN" /></Field></div></CardContent></Card>

        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Settings2 className="h-5 w-5 text-emerald-700" />Currency, tax, and numbering</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Receipt currency" hint="This becomes the default for new sales receipts. Each recorded sale may retain its own currency."><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={settings.currencyCode} onChange={event => update('currencyCode', event.target.value)}>{SALES_RECEIPT_CURRENCIES.map(([code, label]) => <option key={code} value={code}>{code} - {label}</option>)}</select></Field><Field label="Number and date format"><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={settings.locale} onChange={event => update('locale', event.target.value)}>{SALES_RECEIPT_LOCALES.map(([locale, label]) => <option key={locale} value={locale}>{label}</option>)}</select></Field><Field label="Receipt number prefix" hint="Example: FARM, SALES, or REC. Unique sale references are appended automatically."><Input value={settings.receiptPrefix} maxLength={16} onChange={event => update('receiptPrefix', event.target.value.replace(/[^A-Za-z0-9-]/g, '').toUpperCase())} /></Field><Field label="Default tax rate (%)"><Input type="number" min={0} max={100} step="0.01" value={settings.defaultTaxRate} onChange={event => update('defaultTaxRate', Math.min(100, Math.max(0, Number(event.target.value) || 0)))} /></Field></div><ToggleRow checked={settings.showTax} onChange={checked => update('showTax', checked)} title="Show tax breakdown" description="Displays the configured tax rate and value, including a zero-tax line where appropriate." /></CardContent></Card>

        <Card><CardHeader><CardTitle className="text-lg">Customer-facing content</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><ToggleRow checked={settings.showCustomerContact} onChange={checked => update('showCustomerContact', checked)} title="Customer contact" description="Show contact and address captured on the sale." /><ToggleRow checked={settings.showSeller} onChange={checked => update('showSeller', checked)} title="Salesperson" description="Show who recorded or served the sale." /><ToggleRow checked={settings.showSignature} onChange={checked => update('showSignature', checked)} title="Signature line" description="Add an authorization line to printed documents." /><ToggleRow checked={settings.showPoweredBy} onChange={checked => update('showPoweredBy', checked)} title="StockIntel credit" description="Show a discreet platform credit in the footer." /></div>{settings.showSignature ? <Field label="Signature line label"><Input value={settings.signatureLabel} maxLength={50} onChange={event => update('signatureLabel', event.target.value)} /></Field> : null}<Field label="Payment instructions"><textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" value={settings.paymentInstructions} maxLength={400} onChange={event => update('paymentInstructions', event.target.value)} placeholder="Bank, mobile money, or settlement instructions shown to customers" /></Field><Field label="Terms"><textarea className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" value={settings.termsText} maxLength={600} onChange={event => update('termsText', event.target.value)} /></Field><Field label="Closing message"><Input value={settings.footerText} maxLength={160} onChange={event => update('footerText', event.target.value)} /></Field></CardContent></Card>

        <div className="sticky bottom-3 z-20 flex flex-col gap-3 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{dirty ? 'Unpublished changes' : 'Design is published'}</p><p className="text-xs text-muted-foreground">{dirty ? 'Your draft is protected in this browser until you save.' : `Active for ${organization.name}'s customer sales receipts.`}</p></div><Button type="button" variant="outline" onClick={resetDesign}><RotateCcw className="mr-2 h-4 w-4" />Restore standard</Button><Button type="button" disabled={saving || !dirty} onClick={() => void saveDesign()}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save and publish</Button></div>
      </section>

      <aside className={cn('lg:sticky lg:top-20', mobileView !== 'preview' && 'hidden lg:block')}><div className="mb-3 flex items-center justify-between"><div><p className="flex items-center gap-2 text-sm font-semibold"><BadgeCheck className="h-4 w-4 text-emerald-700" />Exact customer preview</p><p className="text-xs text-muted-foreground">The print/PDF receipt uses this same renderer.</p></div><Button size="sm" variant="outline" onClick={testPrint}><Printer className="mr-2 h-4 w-4" />Print preview</Button></div><div className="overflow-hidden rounded-2xl border bg-slate-100 p-2 shadow-inner sm:p-4"><iframe title="Live sales receipt preview" className="h-[760px] w-full rounded-xl border bg-white" srcDoc={previewHtml} /></div></aside>
    </div>
  </div>;
}
