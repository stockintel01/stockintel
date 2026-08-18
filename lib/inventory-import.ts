import type { AgricCategory, AgricInventoryItem, UOM } from '@/lib/agric/types';

export interface InventoryImportResult {
    items: Omit<AgricInventoryItem, 'id'>[];
    errors: string[];
    totalRows: number;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_ROWS = 5000;

export const INVENTORY_IMPORT_TEMPLATE_HEADERS = [
    'Name',
    'Chemical Component',
    'Category',
    'UOM',
    'Pack Size',
    'Current Stock',
    'Minimum Stock',
    'Unit Cost',
    'Average Weekly Usage',
    'Reorder Alert Days',
    'Location',
] as const;

const INVENTORY_IMPORT_TEMPLATE_ROWS: Array<Array<string | number>> = [
    ['Copper Fungicide', 'Copper compound', 'fungicide', 'kg', '20 x 500 g', 80, 25, 92, 12, 7, 'Main Store'],
    ['NPK 15-15-15', '', 'fertilizer', 'kg', '50 kg bag', 500, 200, 8.8, 75, 14, 'Fertilizer Bay'],
];

function csvCell(value: string | number): string {
    return `"${String(value).replaceAll('"', '""')}"`;
}

export function createInventoryImportTemplateCsv(): string {
    return [INVENTORY_IMPORT_TEMPLATE_HEADERS, ...INVENTORY_IMPORT_TEMPLATE_ROWS]
        .map(row => row.map(csvCell).join(','))
        .join('\r\n');
}

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
    chemicalComponent: ['chemicalcomponent', 'component', 'activeingredient', 'ingredient'],
    currentStock: ['quantity', 'qty', 'stock', 'currentstock'],
    uom: ['unit', 'uom', 'unitofmeasure'],
    packSize: ['packsize', 'packagesize', 'packaging'],
    unitCost: ['costprice', 'cost', 'purchaseprice', 'unitcost', 'price', 'unitprice', 'marketprice'],
    avgWeeklyUsage: ['averageweeklyusage', 'avgweeklyusage', 'weeklyusage'],
    reorderAlertDays: ['reorderalertdays', 'alertdays', 'reorderdays'],
    minimumStock: ['minimumstock', 'minstock', 'reorderpoint', 'reorderlevel'],
    category: ['category', 'type'],
    location: ['location', 'rack', 'warehouse', 'storagelocation'],
};

const CATEGORY_VALUES: AgricCategory[] = ['fungicide', 'insecticide', 'herbicide', 'fertilizer', 'equipment', 'seed', 'other'];
const UOM_VALUES: UOM[] = ['lt', 'kg', 'ml', 'g', 'units', 'bags', 'L', 'boxes'];

function parseCategory(value: string): AgricCategory {
    const normalized = value.toLowerCase().replace(/[^a-z]/g, '');
    return CATEGORY_VALUES.find(category => normalized === category) ?? 'other';
}

function parseUom(value: string): UOM {
    const normalized = value.trim();
    return UOM_VALUES.find(uom => uom.toLowerCase() === normalized.toLowerCase()) ?? 'units';
}

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
    const missing = ['name', 'currentStock'].filter(field => columns[field] < 0);
    if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}.`);

    const items: Omit<AgricInventoryItem, 'id'>[] = [];
    const errors: string[] = [];
    const seenNames = new Set<string>();

    rows.slice(1).forEach((row, index) => {
        const rowNumber = index + 2;
        const get = (field: string) => columns[field] >= 0 ? row[columns[field]] : '';
        const name = text(get('name'));
        const currentStock = numberValue(get('currentStock'));
        const minimumStockRaw = get('minimumStock');
        const minimumStock = text(minimumStockRaw) ? numberValue(minimumStockRaw) : 5;
        const unitCostRaw = get('unitCost');
        const unitCost = text(unitCostRaw) ? numberValue(unitCostRaw) : 0;
        const avgWeeklyUsageRaw = get('avgWeeklyUsage');
        const avgWeeklyUsage = text(avgWeeklyUsageRaw) ? numberValue(avgWeeklyUsageRaw) : undefined;
        const reorderAlertDaysRaw = get('reorderAlertDays');
        const reorderAlertDays = text(reorderAlertDaysRaw) ? numberValue(reorderAlertDaysRaw) : 7;
        const rowKey = `${name}:${text(get('category'))}`.toLowerCase();

        const rowErrors: string[] = [];
        if (!name) rowErrors.push('item name is required');
        if (!Number.isFinite(currentStock) || currentStock < 0) rowErrors.push('current stock must be zero or greater');
        if (!Number.isFinite(minimumStock) || minimumStock < 0) rowErrors.push('minimum stock must be zero or greater');
        if (!Number.isFinite(unitCost) || unitCost < 0) rowErrors.push('unit cost must be zero or greater');
        if (avgWeeklyUsage !== undefined && (!Number.isFinite(avgWeeklyUsage) || avgWeeklyUsage < 0)) rowErrors.push('average weekly usage must be zero or greater');
        if (!Number.isFinite(reorderAlertDays) || reorderAlertDays < 0) rowErrors.push('reorder alert days must be zero or greater');
        if (name && seenNames.has(rowKey)) rowErrors.push('duplicate item/category in file');

        if (rowErrors.length) {
            errors.push(`Row ${rowNumber}: ${rowErrors.join('; ')}`);
            return;
        }

        seenNames.add(rowKey);
        items.push({
            name,
            chemicalComponent: text(get('chemicalComponent')) || undefined,
            category: parseCategory(text(get('category'))),
            uom: parseUom(text(get('uom'))),
            packSize: text(get('packSize')) || undefined,
            currentStock,
            minimumStock,
            reorderAlertDays,
            unitCost,
            avgWeeklyUsage,
            location: text(get('location')) || 'Main Store',
            lastUpdated: new Date().toISOString().slice(0, 10),
            createdBy: 'import',
            isActive: true,
        });
    });

    return { items, errors, totalRows: rows.length - 1 };
}
