import assert from 'node:assert/strict';
import {
  buildReceiptNumber,
  buildSalesReceiptHtml,
  calculateSalesReceiptTotals,
  normalizeCurrencyCode,
  normalizeSalesReceiptSettings,
} from '../lib/sales/receipt.ts';

const settings = normalizeSalesReceiptSettings(
  { template: 'a4', currencyCode: 'GHS', receiptPrefix: 'FARM', defaultTaxRate: 12.5 },
  { name: 'Tenant Farm', address: 'Farm Road', currency: 'GHS' },
  'owner@example.com',
);

assert.equal(settings.template, 'modern');
assert.equal(settings.businessName, 'Tenant Farm');
assert.equal(settings.email, 'owner@example.com');
assert.equal(normalizeCurrencyCode('₵'), 'GHS');
assert.equal(normalizeSalesReceiptSettings({ locale: 'not_a_locale' }).locale, 'en-GH');
assert.equal(buildReceiptNumber(settings, 'record-abc123', '2026-09-04'), 'FARM-20260904-ABC123');

const totals = calculateSalesReceiptTotals({
  items: [
    { description: 'Boxes', quantity: 4, unit: 'boxes', unitPrice: 100 },
    { description: 'Trays', quantity: 2, unit: 'trays', unitPrice: 50 },
  ],
  discountAmount: 50,
  taxRate: 10,
  amountPaid: 300,
});
assert.deepEqual(totals, {
  subtotal: 500,
  discount: 50,
  taxableAmount: 450,
  tax: 45,
  total: 495,
  amountPaid: 300,
  balanceDue: 195,
});

const receipt = {
  receiptNumber: 'FARM-1',
  issuedAt: '2026-09-04',
  customerName: '<script>alert(1)</script>',
  paymentStatus: 'paid',
  items: [{ description: 'Grade A eggs', quantity: 2, unit: 'trays', unitPrice: 40 }],
};
const previewHtml = buildSalesReceiptHtml(settings, receipt);
assert.equal(previewHtml.includes('<script>alert(1)</script>'), false);
assert.equal(previewHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), true);
assert.equal(previewHtml.includes("window.addEventListener('load'"), false);

const printHtml = buildSalesReceiptHtml(settings, receipt, { autoPrint: true });
assert.equal(printHtml.includes("window.addEventListener('load'"), true);

console.log('Tenant receipt normalization, numbering, totals, escaping, and print behavior checks passed.');
