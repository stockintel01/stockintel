export interface WaterRecordInput {
  date: string;
  sectorName: string;
  plotName: string;
  cropName: string;
  rainfallMm: number;
  et0Mm: number;
  cropCoefficient: number;
  irrigationMm: number;
  effectiveRainfallPercent: number;
  irrigationEfficiencyPercent: number;
  triggerDeficitMm: number;
  notes?: string;
}

export interface WaterRecord extends WaterRecordInput {
  id: string;
  source: 'manual' | 'import';
  createdBy: string;
  createdByName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface WaterBalanceRow extends WaterRecord {
  cropDemandMm: number;
  effectiveRainfallMm: number;
  dailyDeficitChangeMm: number;
  runningDeficitMm: number;
  irrigationDue: boolean;
  recommendedGrossIrrigationMm: number;
}

export interface WaterForecastDay {
  date: string;
  rainfallMm: number;
  et0Mm: number;
}

export interface IrrigationProjection {
  dueDate: string | null;
  daysUntilDue: number | null;
  projectedDeficitMm: number;
  recommendedGrossIrrigationMm: number;
}

const round = (value: number, decimals = 2) => Number(value.toFixed(decimals));
const groupKey = (record: Pick<WaterRecordInput, 'sectorName' | 'plotName' | 'cropName'>) => `${record.sectorName.trim().toLocaleLowerCase()}|${record.plotName.trim().toLocaleLowerCase()}|${record.cropName.trim().toLocaleLowerCase()}`;

export function calculateWaterBalance(records: WaterRecord[]): WaterBalanceRow[] {
  const deficits = new Map<string, number>();
  return records.slice().sort((a, b) => a.date.localeCompare(b.date) || a.createdByName.localeCompare(b.createdByName)).map(record => {
    const key = groupKey(record);
    const cropDemandMm = Math.max(0, record.et0Mm * record.cropCoefficient);
    const effectiveRainfallMm = Math.max(0, record.rainfallMm * record.effectiveRainfallPercent / 100);
    const dailyDeficitChangeMm = cropDemandMm - effectiveRainfallMm - Math.max(0, record.irrigationMm);
    const runningDeficitMm = Math.max(0, (deficits.get(key) ?? 0) + dailyDeficitChangeMm);
    deficits.set(key, runningDeficitMm);
    return {
      ...record,
      cropDemandMm: round(cropDemandMm),
      effectiveRainfallMm: round(effectiveRainfallMm),
      dailyDeficitChangeMm: round(dailyDeficitChangeMm),
      runningDeficitMm: round(runningDeficitMm),
      irrigationDue: runningDeficitMm >= record.triggerDeficitMm,
      recommendedGrossIrrigationMm: round(runningDeficitMm / Math.max(0.01, record.irrigationEfficiencyPercent / 100)),
    };
  });
}

export function projectNextIrrigation(latest: WaterBalanceRow, forecast: WaterForecastDay[]): IrrigationProjection {
  let deficit = latest.runningDeficitMm;
  for (let index = 0; index < forecast.length; index++) {
    const day = forecast[index];
    const demand = Math.max(0, day.et0Mm * latest.cropCoefficient);
    const effectiveRain = Math.max(0, day.rainfallMm * latest.effectiveRainfallPercent / 100);
    deficit = Math.max(0, deficit + demand - effectiveRain);
    if (deficit >= latest.triggerDeficitMm) {
      return { dueDate: day.date, daysUntilDue: index, projectedDeficitMm: round(deficit), recommendedGrossIrrigationMm: round(deficit / Math.max(0.01, latest.irrigationEfficiencyPercent / 100)) };
    }
  }
  return { dueDate: null, daysUntilDue: null, projectedDeficitMm: round(deficit), recommendedGrossIrrigationMm: round(deficit / Math.max(0.01, latest.irrigationEfficiencyPercent / 100)) };
}

export const WATER_IMPORT_HEADERS = ['Date', 'Sector', 'Plot', 'Crop', 'Rainfall mm', 'ET0 mm', 'Crop coefficient', 'Irrigation applied mm', 'Effective rainfall %', 'Irrigation efficiency %', 'Trigger deficit mm', 'Notes'];

export function createWaterImportTemplateCsv(): string {
  return `${WATER_IMPORT_HEADERS.join(',')}\n2026-01-01,North Sector,Plot 1,Banana,12.5,4.2,1.1,0,80,85,25,Measured with farm rain gauge\n`;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') { value += '"'; index++; }
    else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) { row.push(value); value = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index++;
      row.push(value); value = '';
      if (row.some(cell => cell.trim())) rows.push(row);
      row = [];
    } else value += character;
  }
  row.push(value);
  if (row.some(cell => cell.trim())) rows.push(row);
  return rows;
}

function dateValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function numberValue(value: unknown, fallback: number): number {
  if (value === '' || value === null || value === undefined) return fallback;
  return Number(value);
}

export async function parseWaterImport(file: File): Promise<{ records: WaterRecordInput[]; errors: string[] }> {
  let rows: unknown[][];
  if (file.name.toLocaleLowerCase().endsWith('.xlsx')) {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const worksheet = workbook.worksheets[0];
    rows = [];
    worksheet?.eachRow(row => rows.push(Array.from({ length: WATER_IMPORT_HEADERS.length }, (_, index) => row.getCell(index + 1).value)));
  } else rows = parseCsv(await file.text());
  if (rows.length < 2) return { records: [], errors: ['The file has no data rows.'] };
  const headers = rows[0].map(value => String(value ?? '').trim().toLocaleLowerCase());
  const column = (name: string) => headers.indexOf(name.toLocaleLowerCase());
  const errors: string[] = [];
  const records: WaterRecordInput[] = [];
  rows.slice(1).forEach((row, index) => {
    const get = (name: string) => row[column(name)];
    const record: WaterRecordInput = {
      date: dateValue(get('Date')),
      sectorName: String(get('Sector') ?? '').trim(),
      plotName: String(get('Plot') ?? '').trim(),
      cropName: String(get('Crop') ?? '').trim(),
      rainfallMm: numberValue(get('Rainfall mm'), 0), et0Mm: numberValue(get('ET0 mm'), 0), cropCoefficient: numberValue(get('Crop coefficient'), 1), irrigationMm: numberValue(get('Irrigation applied mm'), 0),
      effectiveRainfallPercent: numberValue(get('Effective rainfall %'), 80), irrigationEfficiencyPercent: numberValue(get('Irrigation efficiency %'), 85), triggerDeficitMm: numberValue(get('Trigger deficit mm'), 25), notes: String(get('Notes') ?? '').trim(),
    };
    const invalid = !record.date || !record.sectorName || !record.plotName || !record.cropName || [record.rainfallMm, record.et0Mm, record.irrigationMm].some(value => !Number.isFinite(value) || value < 0) || !Number.isFinite(record.cropCoefficient) || record.cropCoefficient <= 0 || record.cropCoefficient > 2 || record.effectiveRainfallPercent < 0 || record.effectiveRainfallPercent > 100 || record.irrigationEfficiencyPercent <= 0 || record.irrigationEfficiencyPercent > 100 || record.triggerDeficitMm <= 0;
    if (invalid) errors.push(`Row ${index + 2}: check date, names, non-negative water values, Kc (0-2), percentages and trigger deficit.`);
    else records.push(record);
  });
  return { records, errors };
}
