import type { InventoryItem } from '@/lib/mock-data';

export interface InventoryImportResult {
    items: Omit<InventoryItem, 'id'>[];
    errors: string[];
    totalRows: number;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ROWS = 5000;

function normalizeHeader(value: unknown): string {
    return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function text(value: unknown): string {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'object' && value && 'text' in value) {
        return String((value as { text: unknown }).text ?? '').trim();
    }
    return String(value ?? '').trim();
}

function numberValue(value: unknown): number {
    const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseCsv(content: string): unknown[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;

    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        if (char === '"') {
            if (quoted && content[i + 1] === '"') {
                field += '"';
                i++;
            } else {
                quoted = !quoted;
            }
        } else if (char === ',' && !quoted) {
            row.push(field);
            field = '';
        } else if ((char === '\n' || char === '\r') && !quoted) {
            if (char === '\r' && content[i + 1] === '\n') i++;
            row.push(field);
            if (row.some(cell => cell.trim())) rows.push(row);
            row = [];
            field = '';
        } else {
            field += char;
        }
    }

    row.push(field);
    if (row.some(cell => cell.trim())) rows.push(row);
    return rows;
}

async function readRows(file: File): Promise<unknown[][]> {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'csv') return parseCsv(await file.text());
    if (extension !== 'xlsx') {
        throw new Error('Unsupported file type. Upload a CSV or XLSX file.');
    }

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error('The workbook does not contain a worksheet.');

    const rows: unknown[][] = [];
    worksheet.eachRow({ includeEmpty: false }, row => {
        const values = Array.isArray(row.values) ? row.values.slice(1) : [];
        rows.push(values);
    });
    return rows;
}

const HEADER_ALIASES: Record<string, string[]> = {
    name: ['itemname', 'name', 'productname', 'product'],
    sku: ['sku', 'itemcode', 'productcode', 'code'],
    batchNumber: ['batchnumber', 'batch', 'lotnumber', 'lot'],
    expiryDate: ['expirydateyyyymmdd', 'expirydate', 'expiry', 'expirationdate'],
    quantity: ['quantity', 'qty', 'stock', 'currentstock'],
    unit: ['unit', 'uom', 'unitofmeasure'],
    mrp: ['mrp', 'sellingprice', 'price', 'retailprice'],
    costPrice: ['costprice', 'cost', 'purchaseprice', 'unitcost'],
    category: ['category', 'type'],
    location: ['location', 'rack', 'warehouse', 'storagelocation'],
};

function resolveColumns(headers: unknown[]): Record<string, number> {
    const normalized = headers.map(normalizeHeader);
    return Object.fromEntries(
        Object.entries(HEADER_ALIASES).map(([field, aliases]) => [
            field,
            normalized.findIndex(header => aliases.includes(header)),
        ]),
    );
}

export async function parseInventoryFile(file: File): Promise<InventoryImportResult> {
    if (file.size > MAX_FILE_SIZE) throw new Error('File is too large. Maximum size is 10 MB.');

    const rows = await readRows(file);
    if (rows.length < 2) throw new Error('The file must contain a header row and at least one inventory item.');
    if (rows.length - 1 > MAX_ROWS) throw new Error(`A maximum of ${MAX_ROWS.toLocaleString()} rows can be imported at once.`);

    const columns = resolveColumns(rows[0]);
    const missing = ['name', 'sku', 'quantity', 'mrp'].filter(field => columns[field] < 0);
    if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}.`);

    const items: Omit<InventoryItem, 'id'>[] = [];
    const errors: string[] = [];
    const seenSkus = new Set<string>();

    rows.slice(1).forEach((row, index) => {
        const rowNumber = index + 2;
        const get = (field: string) => columns[field] >= 0 ? row[columns[field]] : '';
        const name = text(get('name'));
        const sku = text(get('sku'));
        const quantity = numberValue(get('quantity'));
        const mrp = numberValue(get('mrp'));
        const costPriceRaw = get('costPrice');
        const costPrice = text(costPriceRaw) ? numberValue(costPriceRaw) : 0;

        const rowErrors: string[] = [];
        if (!name) rowErrors.push('item name is required');
        if (!sku) rowErrors.push('SKU is required');
        if (!Number.isFinite(quantity) || quantity < 0) rowErrors.push('quantity must be zero or greater');
        if (!Number.isFinite(mrp) || mrp < 0) rowErrors.push('MRP/price must be zero or greater');
        if (!Number.isFinite(costPrice) || costPrice < 0) rowErrors.push('cost price must be zero or greater');
        if (sku && seenSkus.has(sku.toLowerCase())) rowErrors.push('duplicate SKU in file');

        if (rowErrors.length) {
            errors.push(`Row ${rowNumber}: ${rowErrors.join('; ')}`);
            return;
        }

        seenSkus.add(sku.toLowerCase());
        items.push({
            name,
            sku,
            batchNumber: text(get('batchNumber')),
            expiryDate: text(get('expiryDate')),
            quantity,
            unit: text(get('unit')) || 'Units',
            mrp,
            costPrice,
            category: text(get('category')) || 'General',
            location: text(get('location')) || 'Main Store',
        });
    });

    return { items, errors, totalRows: rows.length - 1 };
}
