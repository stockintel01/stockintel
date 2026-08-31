import { getFarmWeek } from './week';
import { calculateSigatokaMetrics, type SigatokaAdvancedStageLeafCount, type SigatokaLeafScore, type SigatokaPlantObservation, type SigatokaSessionRecord } from './sigatoka';

export const SIGATOKA_IMPORT_HEADERS = ['Sector', 'Plot', 'Observation Date', 'Plant Number', 'Previous Leaf Reading', 'Current Leaf Reading', 'Leaf II Class', 'Leaf III Class', 'Leaf IV Class', 'YIL', 'YNL', 'NLF', 'NLH', 'Rainfall mm', 'Treatment Date', 'Treatment Product', 'Active Ingredient', 'Dose', 'Method', 'Mean FER Override', 'Interval Days Override', 'Previous Final FER Override', 'Monitoring Week Override', 'Detailed Stage Plant Number', 'Detailed Leaf Number', 'Stage 4 Count', 'Stage 5 Count', 'Stage 6 Count', 'Source Reference', 'Notes'] as const;

const exampleRows = [
  ['Main Farm', 'A02', '2026-01-08', 1, 12.1, 13.2, '2-', '3+', '3-', 3, 6, 10, 5, 22, '', '', '', '', '', '', '', '', '', 1, 5, 0, 0, 0, '', 'Replace examples with farm records'],
  ['Main Farm', 'A02', '2026-01-08', 2, 11.8, 12.9, '1+', '2-', '3+', 4, 6, 11, 4, 22, '', '', '', '', '', '', '', '', '', 1, 6, 4, 1, 0, '', 'Repeat the detailed plant number on rows used for leaf 5-13 counts'],
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

function unwrap(value: unknown): unknown {
  if (typeof value === 'object' && value) {
    if ('result' in value) return (value as { result: unknown }).result;
    if ('text' in value) return (value as { text: unknown }).text;
  }
  return value;
}

const normalize = (value: unknown) => String(unwrap(value) ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const asText = (value: unknown) => {
  const plain = unwrap(value);
  if (plain instanceof Date) {
    const year = plain.getFullYear();
    const month = String(plain.getMonth() + 1).padStart(2, '0');
    const day = String(plain.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(plain ?? '').trim();
};
const asNumber = (value: unknown, optional = false): number | null => {
  if (optional && asText(value) === '') return null;
  const parsed = Number(String(unwrap(value) ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

function legacyWorkbookRows(workbook: import('exceljs').Workbook): unknown[][] {
  const blocks = new Map<string, { rows: unknown[][]; quality: number }>();
  const rainfallByWeek = new Map<string, number>();
  const synthesisSheet = workbook.worksheets.find(sheet => normalize(sheet.name) === 'synth');
  if (synthesisSheet) {
    for (let rowIndex = 1; rowIndex <= synthesisSheet.rowCount; rowIndex++) {
      const row = synthesisSheet.getRow(rowIndex);
      const year = asNumber(row.getCell(2).value, true);
      const week = asNumber(row.getCell(3).value, true);
      const rainfall = asNumber(row.getCell(4).value, true);
      if (year !== null && week !== null && rainfall !== null) {
        rainfallByWeek.set(`${Math.trunc(year)}|${Math.trunc(week)}`, rainfall);
      }
    }
  }
  for (const sheet of workbook.worksheets) {
    const nameMatch = sheet.name.trim().match(/^(\S+)\s+(.+)$/);
    if (!nameMatch || ['leaves', 'synth', 'graphes', 'coeff'].includes(sheet.name.toLowerCase())) continue;
    const [, sector, plot] = nameMatch;
    for (let rowIndex = 1; rowIndex <= sheet.rowCount; rowIndex++) {
      if (normalize(sheet.getRow(rowIndex).getCell(2).value) !== 'date') continue;
      const date = asText(sheet.getRow(rowIndex).getCell(3).value);
      const workbookWeek = asNumber(sheet.getRow(rowIndex).getCell(6).value, true);
      const monitoringWeekOverride = workbookWeek !== null && workbookWeek >= 1 ? Math.min(52, Math.trunc(workbookWeek)) : null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const rainfall = workbookWeek === null ? null : rainfallByWeek.get(`${date.slice(0, 4)}|${Math.trunc(workbookWeek)}`) ?? null;
      let headerRow = 0;
      for (let candidate = rowIndex + 1; candidate <= Math.min(rowIndex + 5, sheet.rowCount); candidate++) {
        if (normalize(sheet.getRow(candidate).getCell(2).value) === 'btn') { headerRow = candidate; break; }
      }
      if (!headerRow) continue;
      let advancedTitleRow = 0;
      for (let candidate = rowIndex; candidate <= Math.min(headerRow + 2, sheet.rowCount); candidate++) {
        if (normalize(sheet.getRow(candidate).getCell(29).value).includes('observationofstages')) { advancedTitleRow = candidate; break; }
      }
      const advancedStagePlantNumber = advancedTitleRow ? asNumber(sheet.getRow(advancedTitleRow + 1).getCell(30).value, true) : null;
      const plantRows: Array<{ values: unknown[]; sourceReference: string; advancedLeafNumber: number | null; stage4Count: number | null; stage5Count: number | null; stage6Count: number | null }> = [];
      let lastPlantRow = headerRow;
      for (let plantRow = headerRow + 1; plantRow <= Math.min(headerRow + 30, sheet.rowCount); plantRow++) {
        const row = sheet.getRow(plantRow);
        const plantNumber = asNumber(row.getCell(2).value, true);
        if (plantNumber === null) {
          if (plantRow > headerRow + 1) break;
          continue;
        }
        lastPlantRow = plantRow;
        const advancedRow = advancedTitleRow ? sheet.getRow(advancedTitleRow + 3 + plantRows.length) : null;
        plantRows.push({
          values: [
            sector, plot, date, plantNumber,
            unwrap(row.getCell(3).value), unwrap(row.getCell(4).value),
            unwrap(row.getCell(6).value), unwrap(row.getCell(7).value), unwrap(row.getCell(8).value),
            unwrap(row.getCell(9).value), unwrap(row.getCell(11).value),
            unwrap(row.getCell(21).value), unwrap(row.getCell(22).value), rainfall ?? '', '', '', '', '', '',
          ],
          sourceReference: `${sheet.name}!${plantRow}`,
          advancedLeafNumber: advancedRow ? asNumber(advancedRow.getCell(29).value, true) : null,
          stage4Count: advancedRow ? asNumber(advancedRow.getCell(30).value, true) : null,
          stage5Count: advancedRow ? asNumber(advancedRow.getCell(31).value, true) : null,
          stage6Count: advancedRow ? asNumber(advancedRow.getCell(32).value, true) : null,
        });
      }
      let meanFerOverride: number | null = null;
      let intervalDaysOverride: number | null = null;
      let previousFinalFerOverride: number | null = null;
      for (let summaryRow = lastPlantRow + 1; summaryRow <= Math.min(lastPlantRow + 6, sheet.rowCount); summaryRow++) {
        const row = sheet.getRow(summaryRow);
        const summaryLabel = normalize(row.getCell(3).value);
        if (summaryLabel === 'avgfer') meanFerOverride = asNumber(row.getCell(5).value, true);
        if (summaryLabel === 'nbdays') {
          const workbookInterval = asNumber(row.getCell(5).value, true);
          intervalDaysOverride = workbookInterval !== null && workbookInterval > 0 ? workbookInterval : null;
        }
        if (normalize(row.getCell(6).value) === 'finalferw1') previousFinalFerOverride = asNumber(row.getCell(7).value, true);
      }
      const normalizedRows = plantRows.map(row => [...row.values, meanFerOverride ?? '', intervalDaysOverride ?? '', previousFinalFerOverride ?? '', monitoringWeekOverride ?? '', advancedStagePlantNumber ?? '', advancedStagePlantNumber === null ? '' : row.advancedLeafNumber ?? '', advancedStagePlantNumber === null ? '' : row.stage4Count ?? '', advancedStagePlantNumber === null ? '' : row.stage5Count ?? '', advancedStagePlantNumber === null ? '' : row.stage6Count ?? '', row.sourceReference, `Imported from ${sheet.name}`]);
      const quality = plantRows.reduce((total, row) => total + Number(asNumber(row.values[4], true) !== null && asNumber(row.values[5], true) !== null), 0);
      const blockKey = `${sector.toLowerCase()}|${plot.toLowerCase()}|${date}`;
      if (quality >= (blocks.get(blockKey)?.quality ?? -1)) blocks.set(blockKey, { rows: normalizedRows, quality });
    }
  }
  return [Array.from(SIGATOKA_IMPORT_HEADERS), ...Array.from(blocks.values()).flatMap(block => block.rows)];
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
  const normalizedHeaders = rows[0]?.map(normalize) ?? [];
  const isStandardImport = ['sector', 'plot', 'observationdate', 'plantnumber'].every(header => normalizedHeaders.includes(header));
  if (!isStandardImport) {
    const legacyRows = legacyWorkbookRows(workbook);
    if (legacyRows.length > 1) return legacyRows;
  }
  return rows;
}
function parseScore(value: unknown): SigatokaLeafScore | null | 'invalid' {
  const raw = asText(value).replaceAll(' ', '');
  if (!raw || raw === '0' || ['none', 'cut', 'n/a', 'na'].includes(raw.toLowerCase())) return null;
  const match = raw.match(/^([1-6])([+-])$/);
  return match ? { stage: Number(match[1]) as SigatokaLeafScore['stage'], density: match[2] === '+' ? 'high' : 'low' } : 'invalid';
}

export interface SigatokaImportResult {
  sessions: Array<Omit<SigatokaSessionRecord, 'id' | 'createdAt' | 'updatedAt'>>;
  errors: string[];
  totalRows: number;
  skippedRows: number;
}

export async function parseSigatokaImport(file: File, observer: { id: string; name: string }, weekStartsOn: number, initialFerBaseline: number): Promise<SigatokaImportResult> {
  const rows = await readRows(file);
  if (rows.length < 2) throw new Error('The file must contain headings and at least one plant row.');
  if (rows.length > 50001) throw new Error('A maximum of 50,000 plant rows can be imported at once.');
  const headers = rows[0].map(normalize);
  const column = (name: string) => headers.indexOf(normalize(name));
  const required = ['Sector', 'Plot', 'Observation Date', 'Plant Number', 'Previous Leaf Reading', 'Current Leaf Reading'];
  const missing = required.filter(name => column(name) < 0);
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}.`);

  const grouped = new Map<string, { sector: string; plot: string; date: string; plants: SigatokaPlantObservation[]; rainfall: number | null; treatment: SigatokaSessionRecord['treatment']; meanRawFerOverride: number | null; intervalDaysOverride: number | null; previousFinalFerOverride: number | null; monitoringWeekOverride: number | null; advancedStagePlantNumber: number | null; advancedStageLeafCounts: SigatokaAdvancedStageLeafCount[]; notes: string[] }>();
  const blankReadings = new Map<string, { count: number; sector: string; plot: string; date: string; firstReference: string }>();
  const invalidGroups = new Set<string>();
  const errors: string[] = [];
  rows.slice(1).forEach((row, offset) => {
    const get = (name: string) => column(name) >= 0 ? row[column(name)] : '';
    const sector = asText(get('Sector')), plot = asText(get('Plot')), date = asText(get('Observation Date'));
    const plantNumber = asNumber(get('Plant Number'));
    const previous = asNumber(get('Previous Leaf Reading')), current = asNumber(get('Current Leaf Reading'));
    const meanRawFerOverride = asNumber(get('Mean FER Override'), true);
    const intervalDaysOverride = asNumber(get('Interval Days Override'), true);
    const previousFinalFerOverride = asNumber(get('Previous Final FER Override'), true);
    const monitoringWeekOverride = asNumber(get('Monitoring Week Override'), true);
    const advancedStagePlantNumber = asNumber(get('Detailed Stage Plant Number'), true);
    const advancedLeafNumber = asNumber(get('Detailed Leaf Number'), true);
    const advancedCounts = [asNumber(get('Stage 4 Count'), true), asNumber(get('Stage 5 Count'), true), asNumber(get('Stage 6 Count'), true)];
    const hasAdvancedStageData = advancedStagePlantNumber !== null || advancedCounts.some(value => value !== null);
    const scoreInputs = [
      { label: 'Leaf II', value: get('Leaf II Class') },
      { label: 'Leaf III', value: get('Leaf III Class') },
      { label: 'Leaf IV', value: get('Leaf IV Class') },
    ];
    const scores = scoreInputs.map(input => parseScore(input.value));
    const sourceReference = asText(get('Source Reference'));
    const sourceLabel = sourceReference || `Row ${offset + 2}`;
    const rowErrors: string[] = [];
    if (!row.some(value => asText(value))) return;
    if (!sector || !plot) rowErrors.push('sector and plot are required');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T12:00:00`).getTime())) rowErrors.push('date must be YYYY-MM-DD');
    if (!plantNumber || plantNumber < 1 || !Number.isInteger(plantNumber)) rowErrors.push('plant number must be a positive whole number');
    if (meanRawFerOverride !== null && meanRawFerOverride < 0) rowErrors.push('mean FER override cannot be negative');
    if (intervalDaysOverride !== null && intervalDaysOverride <= 0) rowErrors.push('interval days override must be greater than zero');
    if (previousFinalFerOverride !== null && previousFinalFerOverride < 0) rowErrors.push('previous final FER override cannot be negative');
    if (monitoringWeekOverride !== null && (!Number.isInteger(monitoringWeekOverride) || monitoringWeekOverride < 1 || monitoringWeekOverride > 52)) rowErrors.push('monitoring week override must be a whole number from 1 to 52');
    if (hasAdvancedStageData && (!advancedStagePlantNumber || !Number.isInteger(advancedStagePlantNumber) || advancedStagePlantNumber < 1)) rowErrors.push('detailed stage plant number must be a positive whole number');
    if (hasAdvancedStageData && (advancedLeafNumber === null || !Number.isInteger(advancedLeafNumber) || advancedLeafNumber < 5 || advancedLeafNumber > 13)) rowErrors.push('detailed leaf number must be a whole number from 5 to 13');
    if (advancedCounts.some(value => value !== null && (!Number.isInteger(value) || value < 0))) rowErrors.push('stage 4, 5 and 6 counts must be zero or positive whole numbers');
    if (rowErrors.length) { errors.push(`${sourceLabel}: ${rowErrors.join('; ')}`); return; }

    const key = `${sector.toLowerCase()}|${plot.toLowerCase()}|${date}`;
    const readingsAreBlank = asText(get('Previous Leaf Reading')) === '' && asText(get('Current Leaf Reading')) === '';
    if (readingsAreBlank) {
      const existing = blankReadings.get(key);
      blankReadings.set(key, { count: (existing?.count ?? 0) + 1, sector, plot, date, firstReference: existing?.firstReference ?? sourceLabel });
      return;
    }
    if (previous === null || current === null) rowErrors.push('both old and new leaf numbers are required');
    else if (current < previous && meanRawFerOverride === null) rowErrors.push(`new leaf number (${current}) cannot be below old leaf number (${previous}) unless a verified mean FER override is supplied for a plant-number reset`);
    const invalidScores = scoreInputs.filter((_, index) => scores[index] === 'invalid');
    if (invalidScores.length) {
      const values = invalidScores.map(input => `${input.label} value "${asText(input.value)}"`).join(', ');
      rowErrors.push(`${values} ${invalidScores.length === 1 ? 'is' : 'are'} invalid; use blank or a disease class from 1-/1+ through 6-/6+`);
    }
    if (rowErrors.length) { invalidGroups.add(key); errors.push(`${sourceLabel}: ${rowErrors.join('; ')}`); return; }

    const group = grouped.get(key) ?? { sector, plot, date, plants: [], rainfall: asNumber(get('Rainfall mm'), true), treatment: null, meanRawFerOverride, intervalDaysOverride, previousFinalFerOverride, monitoringWeekOverride, advancedStagePlantNumber, advancedStageLeafCounts: [], notes: [] };
    if (meanRawFerOverride !== null && group.meanRawFerOverride !== null && Math.abs(meanRawFerOverride - group.meanRawFerOverride) > 0.000001) {
      invalidGroups.add(key); errors.push(`${sourceLabel}: mean FER override must be consistent for every plant in the observation`); return;
    }
    if (group.meanRawFerOverride === null && meanRawFerOverride !== null) group.meanRawFerOverride = meanRawFerOverride;
    if (hasAdvancedStageData && group.advancedStagePlantNumber !== null && group.advancedStagePlantNumber !== advancedStagePlantNumber) { invalidGroups.add(key); errors.push(`${sourceLabel}: detailed stage plant number must be consistent for the observation`); return; }
    if (hasAdvancedStageData && group.advancedStageLeafCounts.some(item => item.leafNumber === advancedLeafNumber)) { invalidGroups.add(key); errors.push(`${sourceLabel}: duplicate detailed stage leaf number`); return; }
    if (hasAdvancedStageData) {
      group.advancedStagePlantNumber = advancedStagePlantNumber;
      group.advancedStageLeafCounts.push({ leafNumber: advancedLeafNumber!, stage4Count: advancedCounts[0], stage5Count: advancedCounts[1], stage6Count: advancedCounts[2] });
    }
    if (group.plants.some(plant => plant.plantNumber === plantNumber)) { invalidGroups.add(key); errors.push(`${sourceLabel}: duplicate plant number for this plot and date`); return; }
    const treatmentProduct = asText(get('Treatment Product'));
    if (treatmentProduct) group.treatment = { appliedAt: asText(get('Treatment Date')) || date, product: treatmentProduct, activeIngredient: asText(get('Active Ingredient')), dose: asText(get('Dose')), method: asText(get('Method')) };
    const note = asText(get('Notes')); if (note) group.notes.push(note);
    group.plants.push({ plantNumber: plantNumber!, previousLeafReading: previous!, currentLeafReading: current!, leaf2: scores[0] === 'invalid' ? null : scores[0], leaf3: scores[1] === 'invalid' ? null : scores[1], leaf4: scores[2] === 'invalid' ? null : scores[2], youngestInfestedLeaf: asNumber(get('YIL'), true), youngestNecroticLeaf: asNumber(get('YNL'), true), leavesAtFlowering: asNumber(get('NLF'), true), leavesAtHarvest: asNumber(get('NLH'), true), notes: note });
    grouped.set(key, group);
  });

  let skippedRows = 0;
  for (const [key, blank] of blankReadings) {
    if (grouped.has(key)) {
      invalidGroups.add(key);
      errors.push(`${blank.sector} / ${blank.plot}, ${blank.date}: observation is incomplete; ${blank.count} plant reading${blank.count === 1 ? ' is' : 's are'} blank (starting at ${blank.firstReference})`);
    } else {
      skippedRows += blank.count;
    }
  }
  for (const key of invalidGroups) grouped.delete(key);

  const previousFer = new Map<string, number>();
  const sessions = Array.from(grouped.values()).sort((a, b) => a.date.localeCompare(b.date)).map(group => {
    group.plants.sort((a, b) => a.plantNumber - b.plantNumber);
    const plotKey = `${group.sector.toLowerCase()}|${group.plot.toLowerCase()}`;
    const prior = group.previousFinalFerOverride ?? previousFer.get(plotKey) ?? initialFerBaseline;
    const priorDate = Array.from(grouped.values()).filter(item => item.plot.toLowerCase() === group.plot.toLowerCase() && item.date < group.date).sort((a, b) => b.date.localeCompare(a.date))[0]?.date;
    const intervalDays = group.intervalDaysOverride ?? (priorDate ? Math.max(1, Math.round((new Date(`${group.date}T12:00:00`).getTime() - new Date(`${priorDate}T12:00:00`).getTime()) / 86400000)) : 7);
    const metrics = calculateSigatokaMetrics(group.plants, intervalDays, prior, group.meanRawFerOverride);
    previousFer.set(plotKey, metrics.finalFer);
    const farmWeek = getFarmWeek(group.date, weekStartsOn);
    const advancedPlant = group.advancedStagePlantNumber === null ? undefined : group.plants.find(plant => plant.plantNumber === group.advancedStagePlantNumber);
    const advancedStageObservation = advancedPlant && group.advancedStageLeafCounts.length ? {
      plantNumber: advancedPlant.plantNumber,
      leafCounts: Array.from({ length: 9 }, (_, index) => group.advancedStageLeafCounts.find(item => item.leafNumber === index + 5) ?? { leafNumber: index + 5, stage4Count: null, stage5Count: null, stage6Count: null }),
    } : null;
    return { sectorName: group.sector, plotName: group.plot, plotArea: null, plotAreaSquareMetres: null, areaUnit: '', observedAt: group.date, monitoringWeek: group.monitoringWeekOverride ?? farmWeek.week, monitoringYear: farmWeek.year, observerId: observer.id, observerName: observer.name, intervalDays, meanRawFerOverride: group.meanRawFerOverride, status: 'submitted' as const, plants: group.plants, advancedStageObservation, metrics, rainfallMm: group.rainfall, treatment: group.treatment, notes: group.notes.join(' | ') };
  });
  if (!sessions.length && !errors.length) throw new Error('No completed observations were found. Empty future templates were ignored.');
  return { sessions, errors, totalRows: rows.length - 1, skippedRows };
}
