import { getFarmWeek } from './week';
import { calculateSigatokaMetrics, type SigatokaLeafScore, type SigatokaPlantObservation, type SigatokaSessionRecord } from './sigatoka';

export const SIGATOKA_IMPORT_HEADERS = ['Sector', 'Plot', 'Observation Date', 'Plant Number', 'Previous Leaf Reading', 'Current Leaf Reading', 'Leaf II Class', 'Leaf III Class', 'Leaf IV Class', 'YIL', 'YNL', 'NLF', 'NLH', 'Rainfall mm', 'Treatment Date', 'Treatment Product', 'Active Ingredient', 'Dose', 'Method', 'Notes'] as const;

const exampleRows = [
  ['Main Farm', 'A02', '2026-01-08', 1, 12.1, 13.2, '2-', '3+', '3-', 3, 6, 10, 5, 22, '', '', '', '', '', 'Replace examples with farm records'],
  ['Main Farm', 'A02', '2026-01-08', 2, 11.8, 12.9, '1+', '2-', '3+', 4, 6, 11, 4, 22, '', '', '', '', '', 'One row per sentinel plant'],
];

const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
export const createSigatokaImportTemplateCsv = () => [SIGATOKA_IMPORT_HEADERS, ...exampleRows].map(row => row.map(csvCell).join(',')).join('\r\n');

function parseCsv(content: string): unknown[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let index = 0; index < content.length; index++) {
    const char = content[index];
    if (char === '"') {
      if (quoted && content[index + 1] === '"') { field += '"'; index++; } else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(field); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && content[index + 1] === '\n') index++;
      row.push(field); if (row.some(cell => cell.trim())) rows.push(row); row = []; field = '';
    } else field += char;
  }
  row.push(field); if (row.some(cell => cell.trim())) rows.push(row);
  return rows;
}

async function readRows(file: File): Promise<unknown[][]> {
  if (file.size > 15 * 1024 * 1024) throw new Error('File is too large. Maximum size is 15 MB.');
  if (file.name.toLowerCase().endsWith('.csv')) return parseCsv(await file.text());
  if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('Upload a CSV or XLSX file.');
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('The workbook does not contain a worksheet.');
  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, row => rows.push(Array.isArray(row.values) ? row.values.slice(1) : []));
  return rows;
}

const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const asText = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '').trim();
const asNumber = (value: unknown, optional = false): number | null => {
  if (optional && asText(value) === '') return null;
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};
function parseScore(value: unknown): SigatokaLeafScore | null | 'invalid' {
  const raw = asText(value).replaceAll(' ', '');
  if (!raw || raw === '0' || raw.toLowerCase() === 'none') return null;
  const match = raw.match(/^([1-6])([+-])$/);
  return match ? { stage: Number(match[1]) as SigatokaLeafScore['stage'], density: match[2] === '+' ? 'high' : 'low' } : 'invalid';
}

export interface SigatokaImportResult {
  sessions: Array<Omit<SigatokaSessionRecord, 'id' | 'createdAt' | 'updatedAt'>>;
  errors: string[];
  totalRows: number;
}

export async function parseSigatokaImport(file: File, observer: { id: string; name: string }, weekStartsOn: number, initialFerBaseline: number): Promise<SigatokaImportResult> {
  const rows = await readRows(file);
  if (rows.length < 2) throw new Error('The file must contain headings and at least one plant row.');
  if (rows.length > 10001) throw new Error('A maximum of 10,000 plant rows can be imported at once.');
  const headers = rows[0].map(normalize);
  const column = (name: string) => headers.indexOf(normalize(name));
  const required = ['Sector', 'Plot', 'Observation Date', 'Plant Number', 'Previous Leaf Reading', 'Current Leaf Reading'];
  const missing = required.filter(name => column(name) < 0);
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}.`);

  const grouped = new Map<string, { sector: string; plot: string; date: string; plants: SigatokaPlantObservation[]; rainfall: number | null; treatment: SigatokaSessionRecord['treatment']; notes: string[] }>();
  const errors: string[] = [];
  rows.slice(1).forEach((row, offset) => {
    const get = (name: string) => column(name) >= 0 ? row[column(name)] : '';
    const sector = asText(get('Sector')), plot = asText(get('Plot')), date = asText(get('Observation Date'));
    const plantNumber = asNumber(get('Plant Number'));
    const previous = asNumber(get('Previous Leaf Reading')), current = asNumber(get('Current Leaf Reading'));
    const scores = [parseScore(get('Leaf II Class')), parseScore(get('Leaf III Class')), parseScore(get('Leaf IV Class'))];
    const rowErrors: string[] = [];
    if (!sector || !plot) rowErrors.push('sector and plot are required');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T12:00:00`).getTime())) rowErrors.push('date must be YYYY-MM-DD');
    if (!plantNumber || plantNumber < 1 || !Number.isInteger(plantNumber)) rowErrors.push('plant number must be a positive whole number');
    if (previous === null || current === null || current < previous) rowErrors.push('leaf readings are required and current cannot be below previous');
    if (scores.includes('invalid')) rowErrors.push('leaf classes must be blank or 1-/1+ through 6-/6+');
    if (rowErrors.length) { errors.push(`Row ${offset + 2}: ${rowErrors.join('; ')}`); return; }

    const key = `${sector.toLowerCase()}|${plot.toLowerCase()}|${date}`;
    const group = grouped.get(key) ?? { sector, plot, date, plants: [], rainfall: asNumber(get('Rainfall mm'), true), treatment: null, notes: [] };
    if (group.plants.some(plant => plant.plantNumber === plantNumber)) { errors.push(`Row ${offset + 2}: duplicate plant number for this plot and date`); return; }
    const treatmentProduct = asText(get('Treatment Product'));
    if (treatmentProduct) group.treatment = { appliedAt: asText(get('Treatment Date')) || date, product: treatmentProduct, activeIngredient: asText(get('Active Ingredient')), dose: asText(get('Dose')), method: asText(get('Method')) };
    const note = asText(get('Notes')); if (note) group.notes.push(note);
    group.plants.push({ plantNumber: plantNumber!, previousLeafReading: previous!, currentLeafReading: current!, leaf2: scores[0] === 'invalid' ? null : scores[0], leaf3: scores[1] === 'invalid' ? null : scores[1], leaf4: scores[2] === 'invalid' ? null : scores[2], youngestInfestedLeaf: asNumber(get('YIL'), true), youngestNecroticLeaf: asNumber(get('YNL'), true), leavesAtFlowering: asNumber(get('NLF'), true), leavesAtHarvest: asNumber(get('NLH'), true), notes: note });
    grouped.set(key, group);
  });

  const previousFer = new Map<string, number>();
  const sessions = Array.from(grouped.values()).sort((a, b) => a.date.localeCompare(b.date)).map(group => {
    group.plants.sort((a, b) => a.plantNumber - b.plantNumber);
    const plotKey = `${group.sector.toLowerCase()}|${group.plot.toLowerCase()}`;
    const prior = previousFer.get(plotKey) ?? initialFerBaseline;
    const priorDate = Array.from(grouped.values()).filter(item => item.plot.toLowerCase() === group.plot.toLowerCase() && item.date < group.date).sort((a, b) => b.date.localeCompare(a.date))[0]?.date;
    const intervalDays = priorDate ? Math.max(1, Math.round((new Date(`${group.date}T12:00:00`).getTime() - new Date(`${priorDate}T12:00:00`).getTime()) / 86400000)) : 7;
    const metrics = calculateSigatokaMetrics(group.plants, intervalDays, prior);
    previousFer.set(plotKey, metrics.finalFer);
    const farmWeek = getFarmWeek(group.date, weekStartsOn);
    return { sectorName: group.sector, plotName: group.plot, plotArea: null, plotAreaSquareMetres: null, areaUnit: '', observedAt: group.date, monitoringWeek: farmWeek.week, monitoringYear: farmWeek.year, observerId: observer.id, observerName: observer.name, intervalDays, status: 'submitted' as const, plants: group.plants, metrics, rainfallMm: group.rainfall, treatment: group.treatment, notes: group.notes.join(' | ') };
  });
  return { sessions, errors, totalRows: rows.length - 1 };
}
