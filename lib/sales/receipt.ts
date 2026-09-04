export type SalesReceiptTemplate = 'modern' | 'classic' | 'compact';
export type SalesReceiptPaperSize = 'a4' | 'letter' | '80mm';

export interface SalesReceiptSettings {
  version: 1;
  template: SalesReceiptTemplate;
  paperSize: SalesReceiptPaperSize;
  documentTitle: string;
  businessName: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  taxId: string;
  taxLabel: string;
  logoUrl: string;
  showLogo: boolean;
  primaryColor: string;
  accentColor: string;
  currencyCode: string;
  locale: string;
  receiptPrefix: string;
  defaultTaxRate: number;
  showTax: boolean;
  showCustomerContact: boolean;
  showSeller: boolean;
  showSignature: boolean;
  signatureLabel: string;
  paymentInstructions: string;
  termsText: string;
  footerText: string;
  showPoweredBy: boolean;
}

export interface SalesReceiptLineItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

export interface SalesReceiptData {
  receiptNumber: string;
  issuedAt: string;
  customerName: string;
  customerContact?: string;
  customerAddress?: string;
  sellerName?: string;
  paymentMethod?: string;
  paymentStatus?: 'paid' | 'partially_paid' | 'unpaid' | 'refunded';
  reference?: string;
  dueDate?: string;
  currencyCode?: string;
  discountAmount?: number;
  taxRate?: number;
  amountPaid?: number;
  notes?: string;
  items: SalesReceiptLineItem[];
}

export interface SalesReceiptTotals {
  subtotal: number;
  discount: number;
  taxableAmount: number;
  tax: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
}

export const SALES_RECEIPT_CURRENCIES = [
  ['GHS', 'Ghanaian Cedi'],
  ['USD', 'US Dollar'],
  ['EUR', 'Euro'],
  ['GBP', 'Pound Sterling'],
  ['NGN', 'Nigerian Naira'],
  ['KES', 'Kenyan Shilling'],
  ['ZAR', 'South African Rand'],
  ['XOF', 'West African CFA Franc'],
  ['XAF', 'Central African CFA Franc'],
] as const;

export const SALES_RECEIPT_LOCALES = [
  ['en-GH', 'English (Ghana)'],
  ['en-US', 'English (United States)'],
  ['en-GB', 'English (United Kingdom)'],
  ['en-NG', 'English (Nigeria)'],
  ['en-KE', 'English (Kenya)'],
  ['fr-FR', 'French'],
] as const;

export const DEFAULT_SALES_RECEIPT_SETTINGS: SalesReceiptSettings = {
  version: 1,
  template: 'modern',
  paperSize: 'a4',
  documentTitle: 'Sales Receipt',
  businessName: '',
  tagline: 'Quality farm produce and dependable service',
  address: '',
  phone: '',
  email: '',
  website: '',
  taxId: '',
  taxLabel: 'Tax ID',
  logoUrl: '',
  showLogo: true,
  primaryColor: '#166534',
  accentColor: '#dcfce7',
  currencyCode: 'GHS',
  locale: 'en-GH',
  receiptPrefix: 'REC',
  defaultTaxRate: 0,
  showTax: true,
  showCustomerContact: true,
  showSeller: true,
  showSignature: false,
  signatureLabel: 'Authorized signature',
  paymentInstructions: '',
  termsText: 'Goods received in good condition. Please retain this receipt for your records.',
  footerText: 'Thank you for your business.',
  showPoweredBy: true,
};

const TEMPLATE_VALUES = new Set<SalesReceiptTemplate>(['modern', 'classic', 'compact']);
const PAPER_VALUES = new Set<SalesReceiptPaperSize>(['a4', 'letter', '80mm']);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function normalizeCurrencyCode(value: unknown, fallback = 'GHS'): string {
  const raw = text(value).toUpperCase();
  const aliases: Record<string, string> = {
    '$': 'USD', 'US$': 'USD', 'GH₵': 'GHS', 'GHC': 'GHS', '₵': 'GHS',
    '€': 'EUR', '£': 'GBP', '₦': 'NGN', 'KSH': 'KES', 'R': 'ZAR',
  };
  const code = aliases[raw] ?? raw;
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: code }).format(0);
    return code;
  } catch {
    return fallback;
  }
}

function normalizeLocale(value: unknown): string {
  const locale = text(value, DEFAULT_SALES_RECEIPT_SETTINGS.locale);
  try {
    new Intl.DateTimeFormat(locale).format(new Date('2026-01-01T12:00:00'));
    return locale;
  } catch {
    return DEFAULT_SALES_RECEIPT_SETTINGS.locale;
  }
}

export function normalizeSalesReceiptSettings(
  value: unknown,
  organization?: { name?: string; address?: string; phone?: string; taxId?: string; currency?: string },
  ownerEmail = '',
): SalesReceiptSettings {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const legacyTemplate = source.template === 'thermal' ? 'compact' : source.template === 'a4' ? 'modern' : source.template === 'minimal' ? 'classic' : source.template;
  const template = TEMPLATE_VALUES.has(legacyTemplate as SalesReceiptTemplate) ? legacyTemplate as SalesReceiptTemplate : DEFAULT_SALES_RECEIPT_SETTINGS.template;
  const impliedPaper = template === 'compact' ? '80mm' : DEFAULT_SALES_RECEIPT_SETTINGS.paperSize;
  const paperSize = PAPER_VALUES.has(source.paperSize as SalesReceiptPaperSize) ? source.paperSize as SalesReceiptPaperSize : impliedPaper;
  const primaryColor = text(source.primaryColor, DEFAULT_SALES_RECEIPT_SETTINGS.primaryColor);
  const accentColor = text(source.accentColor, DEFAULT_SALES_RECEIPT_SETTINGS.accentColor);

  return {
    version: 1,
    template,
    paperSize,
    documentTitle: text(source.documentTitle, DEFAULT_SALES_RECEIPT_SETTINGS.documentTitle),
    businessName: text(source.businessName, organization?.name ?? ''),
    tagline: text(source.tagline, DEFAULT_SALES_RECEIPT_SETTINGS.tagline),
    address: text(source.address, organization?.address ?? ''),
    phone: text(source.phone, organization?.phone ?? ''),
    email: text(source.email, ownerEmail),
    website: text(source.website),
    taxId: text(source.taxId, organization?.taxId ?? ''),
    taxLabel: text(source.taxLabel, DEFAULT_SALES_RECEIPT_SETTINGS.taxLabel),
    logoUrl: text(source.logoUrl),
    showLogo: typeof source.showLogo === 'boolean' ? source.showLogo : DEFAULT_SALES_RECEIPT_SETTINGS.showLogo,
    primaryColor: HEX_COLOR.test(primaryColor) ? primaryColor : DEFAULT_SALES_RECEIPT_SETTINGS.primaryColor,
    accentColor: HEX_COLOR.test(accentColor) ? accentColor : DEFAULT_SALES_RECEIPT_SETTINGS.accentColor,
    currencyCode: normalizeCurrencyCode(source.currencyCode ?? organization?.currency),
    locale: normalizeLocale(source.locale),
    receiptPrefix: text(source.receiptPrefix, DEFAULT_SALES_RECEIPT_SETTINGS.receiptPrefix).replace(/[^A-Za-z0-9-]/g, '').slice(0, 16) || 'REC',
    defaultTaxRate: boundedNumber(source.defaultTaxRate, DEFAULT_SALES_RECEIPT_SETTINGS.defaultTaxRate, 0, 100),
    showTax: typeof source.showTax === 'boolean' ? source.showTax : DEFAULT_SALES_RECEIPT_SETTINGS.showTax,
    showCustomerContact: typeof source.showCustomerContact === 'boolean' ? source.showCustomerContact : DEFAULT_SALES_RECEIPT_SETTINGS.showCustomerContact,
    showSeller: typeof source.showSeller === 'boolean' ? source.showSeller : DEFAULT_SALES_RECEIPT_SETTINGS.showSeller,
    showSignature: typeof source.showSignature === 'boolean' ? source.showSignature : DEFAULT_SALES_RECEIPT_SETTINGS.showSignature,
    signatureLabel: text(source.signatureLabel, DEFAULT_SALES_RECEIPT_SETTINGS.signatureLabel),
    paymentInstructions: text(source.paymentInstructions),
    termsText: text(source.termsText, DEFAULT_SALES_RECEIPT_SETTINGS.termsText),
    footerText: text(source.footerText, DEFAULT_SALES_RECEIPT_SETTINGS.footerText),
    showPoweredBy: typeof source.showPoweredBy === 'boolean' ? source.showPoweredBy : DEFAULT_SALES_RECEIPT_SETTINGS.showPoweredBy,
  };
}

export function calculateSalesReceiptTotals(data: Pick<SalesReceiptData, 'items' | 'discountAmount' | 'taxRate' | 'amountPaid'>): SalesReceiptTotals {
  const subtotal = data.items.reduce((sum, item) => {
    const quantity = Math.max(0, Number(item.quantity) || 0);
    const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
    return sum + quantity * unitPrice;
  }, 0);
  const discount = Math.min(subtotal, Math.max(0, Number(data.discountAmount) || 0));
  const taxableAmount = Math.max(0, subtotal - discount);
  const taxRate = Math.min(100, Math.max(0, Number(data.taxRate) || 0));
  const tax = taxableAmount * taxRate / 100;
  const total = taxableAmount + tax;
  const amountPaid = Math.min(total, Math.max(0, data.amountPaid === undefined ? total : Number(data.amountPaid) || 0));
  return { subtotal, discount, taxableAmount, tax, total, amountPaid, balanceDue: Math.max(0, total - amountPaid) };
}

export function formatReceiptMoney(amount: number, currencyCode: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: normalizeCurrencyCode(currencyCode), minimumFractionDigits: 2 }).format(amount);
  } catch {
    return `${normalizeCurrencyCode(currencyCode)} ${amount.toFixed(2)}`;
  }
}

export function buildReceiptNumber(settings: SalesReceiptSettings, recordId: string, issuedAt: string, existing?: string): string {
  if (existing?.trim()) return existing.trim();
  const date = issuedAt.replace(/[^0-9]/g, '').slice(0, 8) || new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const suffix = recordId.replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase() || '000001';
  return `${settings.receiptPrefix}-${date}-${suffix}`;
}

function htmlEscape(value: unknown): string {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}

function safeLogoUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? htmlEscape(url.toString()) : '';
  } catch {
    return '';
  }
}

function displayDate(value: string, locale: string): string {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(parsed);
}

export function buildSalesReceiptHtml(
  settingsInput: SalesReceiptSettings,
  dataInput: SalesReceiptData,
  options: { autoPrint?: boolean } = {},
): string {
  const settings = normalizeSalesReceiptSettings(settingsInput);
  const currency = normalizeCurrencyCode(dataInput.currencyCode ?? settings.currencyCode);
  const data = { ...dataInput, taxRate: dataInput.taxRate ?? (settings.showTax ? settings.defaultTaxRate : 0) };
  const totals = calculateSalesReceiptTotals(data);
  const money = (amount: number) => htmlEscape(formatReceiptMoney(amount, currency, settings.locale));
  const primary = HEX_COLOR.test(settings.primaryColor) ? settings.primaryColor : DEFAULT_SALES_RECEIPT_SETTINGS.primaryColor;
  const accent = HEX_COLOR.test(settings.accentColor) ? settings.accentColor : DEFAULT_SALES_RECEIPT_SETTINGS.accentColor;
  const logo = settings.showLogo ? safeLogoUrl(settings.logoUrl) : '';
  const pageSize = settings.paperSize === '80mm' ? '80mm auto' : settings.paperSize;
  const status = (data.paymentStatus ?? (totals.balanceDue > 0 ? 'unpaid' : 'paid')).replaceAll('_', ' ');
  const itemRows = data.items.map(item => `<tr><td><strong>${htmlEscape(item.description)}</strong><small>${htmlEscape(item.unit)}</small></td><td class="number">${htmlEscape(item.quantity.toLocaleString(settings.locale))}</td><td class="number">${money(item.unitPrice)}</td><td class="number"><strong>${money(item.quantity * item.unitPrice)}</strong></td></tr>`).join('');
  const customerDetails = settings.showCustomerContact ? [data.customerContact, data.customerAddress].filter(Boolean).map(item => `<div>${htmlEscape(item)}</div>`).join('') : '';
  const seller = settings.showSeller && data.sellerName ? `<div><span>Served by</span><strong>${htmlEscape(data.sellerName)}</strong></div>` : '';
  const amountPaid = totals.amountPaid < totals.total ? `<div><span>Amount paid</span><strong>${money(totals.amountPaid)}</strong></div><div class="balance"><span>Balance due</span><strong>${money(totals.balanceDue)}</strong></div>` : '';

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(data.receiptNumber)} - ${htmlEscape(settings.businessName)}</title><style>
    :root{--primary:${primary};--accent:${accent};--ink:#17201c;--muted:#66736c;--line:#dfe5e1}*{box-sizing:border-box}body{margin:0;background:#eef2ef;color:var(--ink);font:14px/1.45 Arial,sans-serif}.sheet{width:${settings.paperSize === '80mm' ? '80mm' : settings.paperSize === 'letter' ? '216mm' : '210mm'};min-height:${settings.paperSize === '80mm' ? 'auto' : settings.paperSize === 'letter' ? '279mm' : '297mm'};margin:24px auto;background:#fff;padding:${settings.paperSize === '80mm' ? '8mm 6mm' : '18mm'};box-shadow:0 16px 50px #14251b1f}.header{display:flex;gap:18px;align-items:flex-start;border-bottom:3px solid var(--primary);padding-bottom:18px}.brand{display:flex;gap:14px;align-items:center;min-width:0}.logo{width:58px;height:58px;object-fit:contain;border-radius:10px}.mark{width:58px;height:58px;display:grid;place-items:center;border-radius:12px;background:var(--accent);color:var(--primary);font-size:21px;font-weight:800}.brand h1{margin:0;color:var(--primary);font-size:22px}.brand p{margin:3px 0 0;color:var(--muted)}.doc-title{margin-left:auto;text-align:right}.doc-title h2{margin:0;text-transform:uppercase;letter-spacing:.13em;font-size:15px}.doc-title strong{display:block;margin-top:7px;font-size:16px;color:var(--primary)}.details{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:20px 0}.panel{border:1px solid var(--line);border-radius:10px;padding:13px}.panel>span,.summary span,.meta span{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.08em}.panel h3{margin:4px 0;font-size:15px}.meta{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.meta strong{display:block;margin-top:2px}.status{display:inline-block;margin-top:7px;border-radius:99px;background:var(--accent);color:var(--primary);padding:3px 8px;font-size:11px;font-weight:700;text-transform:capitalize}table{width:100%;border-collapse:collapse;margin:18px 0}th{background:var(--primary);color:#fff;padding:10px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em}td{border-bottom:1px solid var(--line);padding:11px 8px;vertical-align:top}td small{display:block;color:var(--muted);margin-top:2px}.number{text-align:right;white-space:nowrap}.totals{width:min(100%,310px);margin-left:auto}.totals>div{display:flex;justify-content:space-between;padding:6px 2px}.totals .grand{border-top:2px solid var(--primary);margin-top:5px;padding-top:10px;font-size:17px;color:var(--primary)}.totals .balance{color:#b42318}.notes{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:25px}.notes section{border-top:1px solid var(--line);padding-top:10px}.notes h4{margin:0 0 5px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--primary)}.notes p{margin:0;color:var(--muted);white-space:pre-wrap}.signature{width:210px;margin:45px 0 0 auto;border-top:1px solid var(--ink);padding-top:5px;text-align:center;color:var(--muted);font-size:11px}.footer{margin-top:35px;border-top:1px solid var(--line);padding-top:12px;text-align:center;color:var(--muted)}.footer strong{color:var(--primary)}.powered{margin-top:8px;font-size:9px;letter-spacing:.1em;text-transform:uppercase}.classic .header{border:0;border-top:5px solid var(--primary);padding-top:18px}.classic th{background:#f5f7f5;color:var(--ink);border-top:1px solid var(--ink);border-bottom:1px solid var(--ink)}.compact{font-size:11px}.compact .header{display:block;text-align:center;border-bottom:1px dashed var(--ink)}.compact .brand{display:block}.compact .logo,.compact .mark{margin:0 auto 8px;width:46px;height:46px}.compact .doc-title{margin:12px 0 0;text-align:center}.compact .details{display:block}.compact .panel{border:0;border-bottom:1px dashed var(--ink);border-radius:0;padding:10px 0}.compact .meta{margin-top:10px}.compact th{background:none;color:var(--ink);border-bottom:1px solid var(--ink);padding:6px 3px}.compact td{padding:7px 3px}.compact .notes{display:block}.compact .notes section{margin-top:12px}.compact .footer{border-top:1px dashed var(--ink)}
    @media(max-width:700px){body{background:#fff}.sheet{width:100%;min-height:0;margin:0;padding:22px;box-shadow:none}.header{flex-direction:column}.doc-title{margin-left:0;text-align:left}.details,.notes{grid-template-columns:1fr}.table-wrap{overflow-x:auto}table{min-width:560px}}
    @media print{@page{size:${pageSize};margin:0}body{background:#fff}.sheet{margin:0;box-shadow:none;width:100%;min-height:0}.no-print{display:none!important}}
  </style></head><body><main class="sheet ${htmlEscape(settings.template)}">
    <header class="header"><div class="brand">${logo ? `<img class="logo" src="${logo}" alt="">` : `<div class="mark">${htmlEscape((settings.businessName || 'F').slice(0, 2).toUpperCase())}</div>`}<div><h1>${htmlEscape(settings.businessName || 'Farm business')}</h1>${settings.tagline ? `<p>${htmlEscape(settings.tagline)}</p>` : ''}${settings.address ? `<p>${htmlEscape(settings.address)}</p>` : ''}${[settings.phone, settings.email, settings.website].filter(Boolean).length ? `<p>${[settings.phone, settings.email, settings.website].filter(Boolean).map(htmlEscape).join(' | ')}</p>` : ''}${settings.taxId ? `<p>${htmlEscape(settings.taxLabel)}: ${htmlEscape(settings.taxId)}</p>` : ''}</div></div><div class="doc-title"><h2>${htmlEscape(settings.documentTitle)}</h2><strong>${htmlEscape(data.receiptNumber)}</strong><span class="status">${htmlEscape(status)}</span></div></header>
    <section class="details"><div class="panel"><span>Sold to</span><h3>${htmlEscape(data.customerName || 'Walk-in customer')}</h3>${customerDetails}</div><div class="panel meta"><div><span>Issue date</span><strong>${htmlEscape(displayDate(data.issuedAt, settings.locale))}</strong></div>${data.dueDate ? `<div><span>Due date</span><strong>${htmlEscape(displayDate(data.dueDate, settings.locale))}</strong></div>` : ''}${data.paymentMethod ? `<div><span>Payment</span><strong>${htmlEscape(data.paymentMethod.replaceAll('_', ' '))}</strong></div>` : ''}${data.reference ? `<div><span>Reference</span><strong>${htmlEscape(data.reference)}</strong></div>` : ''}${seller}</div></section>
    <div class="table-wrap"><table><thead><tr><th>Description</th><th class="number">Qty</th><th class="number">Unit price</th><th class="number">Amount</th></tr></thead><tbody>${itemRows || '<tr><td colspan="4">No sale items recorded.</td></tr>'}</tbody></table></div>
    <section class="totals"><div><span>Subtotal</span><strong>${money(totals.subtotal)}</strong></div>${totals.discount > 0 ? `<div><span>Discount</span><strong>- ${money(totals.discount)}</strong></div>` : ''}${settings.showTax || totals.tax > 0 ? `<div><span>Tax (${htmlEscape(data.taxRate ?? 0)}%)</span><strong>${money(totals.tax)}</strong></div>` : ''}<div class="grand"><span>Total</span><strong>${money(totals.total)}</strong></div>${amountPaid}</section>
    ${(data.notes || settings.paymentInstructions || settings.termsText) ? `<section class="notes">${data.notes ? `<section><h4>Sale notes</h4><p>${htmlEscape(data.notes)}</p></section>` : ''}${settings.paymentInstructions ? `<section><h4>Payment instructions</h4><p>${htmlEscape(settings.paymentInstructions)}</p></section>` : ''}${settings.termsText ? `<section><h4>Terms</h4><p>${htmlEscape(settings.termsText)}</p></section>` : ''}</section>` : ''}
    ${settings.showSignature ? `<div class="signature">${htmlEscape(settings.signatureLabel)}</div>` : ''}<footer class="footer"><strong>${htmlEscape(settings.footerText)}</strong>${settings.showPoweredBy ? '<div class="powered">Created with StockIntel Agri</div>' : ''}</footer>
  </main>${options.autoPrint ? "<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script>" : ''}</body></html>`;
}

export function printSalesReceipt(settings: SalesReceiptSettings, data: SalesReceiptData): boolean {
  if (typeof window === 'undefined') return false;
  const popup = window.open('', '_blank', 'width=980,height=760');
  if (!popup) return false;
  popup.document.open();
  popup.document.write(buildSalesReceiptHtml(settings, data, { autoPrint: true }));
  popup.document.close();
  return true;
}
