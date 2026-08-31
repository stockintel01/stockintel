import {
  diseaseClassLabel,
  sigatokaCoefficient,
  type SigatokaDensity,
  type SigatokaSessionRecord,
} from './sigatoka';

export interface SigatokaFieldReportOptions {
  organizationName: string;
  sectorLabel: string;
  plotLabel: string;
  plantLabel: string;
  riskThresholds: {
    watch: number | null;
    high: number | null;
    critical: number | null;
  };
}

type QualityLevel = 'ok' | 'warning' | 'error';
type RiskLevel = 'normal' | 'watch' | 'high' | 'critical' | 'unconfigured';

interface ReportPlantRow {
  plantNumber: number;
  plantCode: string;
  previousLeafReading: number;
  currentLeafReading: number;
  fer: number;
  leaf2: string;
  leaf3: string;
  leaf4: string;
  youngestInfestedLeaf: number | null;
  youngestNecroticLeaf: number | null;
  leavesAtFlowering: number | null;
  leavesAtHarvest: number | null;
  qualityLevel: QualityLevel;
  qualityLabel: string;
  qualityMessage: string;
  notes: string;
}

interface StageCalculationRow {
  label: string;
  stage: 1 | 2 | 3 | 4 | 5 | 6;
  density: SigatokaDensity;
  leaf2Count: number;
  leaf3Count: number;
  leaf4Count: number;
  leaf2Score: number;
  leaf3Score: number;
  leaf4Score: number;
}

export interface SigatokaFieldReportModel {
  session: SigatokaSessionRecord;
  options: SigatokaFieldReportOptions;
  plantRows: ReportPlantRow[];
  stageRows: StageCalculationRow[];
  advancedStageRows: Array<{ leafPosition: 'II' | 'III' | 'IV'; stage4: number; stage5: number; stage6: number }>;
  riskLevel: RiskLevel;
  riskLabel: string;
  generatedAt: string;
}

const stageDefinitions = ([1, 2, 3, 4, 5, 6] as const).flatMap(stage => ([
  { stage, density: 'low' as const, label: `${stage}-` },
  { stage, density: 'high' as const, label: `${stage}+` },
]));

function riskForSed(sed: number, thresholds: SigatokaFieldReportOptions['riskThresholds']): { level: RiskLevel; label: string } {
  if (thresholds.critical !== null && sed >= thresholds.critical) return { level: 'critical', label: 'Critical' };
  if (thresholds.high !== null && sed >= thresholds.high) return { level: 'high', label: 'High' };
  if (thresholds.watch !== null && sed >= thresholds.watch) return { level: 'watch', label: 'Watch' };
  if (thresholds.watch === null && thresholds.high === null && thresholds.critical === null) return { level: 'unconfigured', label: 'Thresholds not configured' };
  return { level: 'normal', label: 'Below attention threshold' };
}

function plantQuality(plant: SigatokaSessionRecord['plants'][number], meanRawFerOverride?: number | null): { level: QualityLevel; label: string; message: string } {
  const fer = plant.currentLeafReading - plant.previousLeafReading;
  if (fer < 0 && (meanRawFerOverride === null || meanRawFerOverride === undefined)) return { level: 'error', label: 'ERROR', message: 'New leaf number is below old leaf number.' };
  if (fer < 0) return { level: 'warning', label: 'REVIEW', message: 'A verified historical mean FER override was used for this plant-number reset.' };
  if (plant.youngestInfestedLeaf !== null && plant.youngestNecroticLeaf !== null && plant.youngestInfestedLeaf > plant.youngestNecroticLeaf) {
    return { level: 'error', label: 'ERROR', message: 'YIL cannot be greater than YNL.' };
  }
  if (fer > 3) return { level: 'warning', label: 'REVIEW', message: 'Foliar emission exceeds 3.0; verify the readings and interval.' };
  return { level: 'ok', label: 'OK', message: 'Stored readings passed the core consistency checks.' };
}

export function buildSigatokaFieldReportModel(
  session: SigatokaSessionRecord,
  options: SigatokaFieldReportOptions,
): SigatokaFieldReportModel {
  const plantRows = session.plants.map(plant => {
    const quality = plantQuality(plant, session.meanRawFerOverride);
    return {
      plantNumber: plant.plantNumber,
      plantCode: plant.sentinelPlantCode ?? '',
      previousLeafReading: plant.previousLeafReading,
      currentLeafReading: plant.currentLeafReading,
      fer: plant.currentLeafReading - plant.previousLeafReading,
      leaf2: diseaseClassLabel(plant.leaf2),
      leaf3: diseaseClassLabel(plant.leaf3),
      leaf4: diseaseClassLabel(plant.leaf4),
      youngestInfestedLeaf: plant.youngestInfestedLeaf,
      youngestNecroticLeaf: plant.youngestNecroticLeaf,
      leavesAtFlowering: plant.leavesAtFlowering,
      leavesAtHarvest: plant.leavesAtHarvest,
      qualityLevel: quality.level,
      qualityLabel: quality.label,
      qualityMessage: quality.message,
      notes: plant.notes ?? '',
    };
  });
  const stageRows = stageDefinitions.map(definition => {
    const scores = session.plants.map(plant => [plant.leaf2, plant.leaf3, plant.leaf4] as const);
    const matches = (position: 0 | 1 | 2) => scores.filter(score => score[position]?.stage === definition.stage && score[position]?.density === definition.density).length;
    const leaf2Count = matches(0), leaf3Count = matches(1), leaf4Count = matches(2);
    return {
      ...definition,
      leaf2Count,
      leaf3Count,
      leaf4Count,
      leaf2Score: leaf2Count * sigatokaCoefficient(definition, 2),
      leaf3Score: leaf3Count * sigatokaCoefficient(definition, 3),
      leaf4Score: leaf4Count * sigatokaCoefficient(definition, 4),
    };
  });
  const advancedStageRows = ([2, 3, 4] as const).map((position, index) => ({
    leafPosition: ({ 2: 'II', 3: 'III', 4: 'IV' } as const)[position],
    stage4: session.plants.filter(plant => [plant.leaf2, plant.leaf3, plant.leaf4][index]?.stage === 4).length,
    stage5: session.plants.filter(plant => [plant.leaf2, plant.leaf3, plant.leaf4][index]?.stage === 5).length,
    stage6: session.plants.filter(plant => [plant.leaf2, plant.leaf3, plant.leaf4][index]?.stage === 6).length,
  }));
  const risk = riskForSed(session.metrics.sed, options.riskThresholds);
  return { session, options, plantRows, stageRows, advancedStageRows, riskLevel: risk.level, riskLabel: risk.label, generatedAt: new Date().toLocaleString() };
}

const htmlEscape = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
const displayNumber = (value: number | null | undefined, decimals = 1) => value === null || value === undefined || !Number.isFinite(value) ? '-' : value.toLocaleString(undefined, { maximumFractionDigits: decimals });

export function buildSigatokaFieldReportHtml(model: SigatokaFieldReportModel): string {
  const { session, options } = model;
  const plantRows = model.plantRows.map(row => `<tr>
    <td>${htmlEscape(row.plantCode || row.plantNumber)}</td><td class="input">${displayNumber(row.previousLeafReading, 2)}</td><td class="input">${displayNumber(row.currentLeafReading, 2)}</td><td class="calculated">${displayNumber(row.fer, 2)}</td>
    <td class="input">${htmlEscape(row.leaf2)}</td><td class="input">${htmlEscape(row.leaf3)}</td><td class="input">${htmlEscape(row.leaf4)}</td><td class="input">${displayNumber(row.youngestInfestedLeaf, 1)}</td><td class="input">${displayNumber(row.youngestNecroticLeaf, 1)}</td>
    <td class="quality-${row.qualityLevel}" title="${htmlEscape(row.qualityMessage)}">${row.qualityLabel}</td><td class="input">${displayNumber(row.leavesAtFlowering, 1)}</td><td class="input">${displayNumber(row.leavesAtHarvest, 1)}</td>
  </tr>`).join('');
  const stageRows = model.stageRows.map(row => `<tr><td>${row.label}</td><td>${row.leaf2Count}</td><td>${row.leaf3Count}</td><td>${row.leaf4Count}</td><td>${row.leaf2Score}</td><td>${row.leaf3Score}</td><td>${row.leaf4Score}</td></tr>`).join('');
  const advancedRows = model.advancedStageRows.map(row => `<tr><td>Leaf ${row.leafPosition}</td><td>${row.stage4}</td><td>${row.stage5}</td><td>${row.stage6}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${htmlEscape(options.organizationName)} - ${htmlEscape(session.plotName)} field report</title><style>
    *{box-sizing:border-box}body{margin:0;padding:18px;font:11px Arial,sans-serif;color:#17201b;background:#fff}.page{max-width:1500px;margin:auto}.header{display:flex;justify-content:space-between;gap:20px;border-bottom:4px solid #17643a;padding-bottom:10px;margin-bottom:12px}.eyebrow{color:#17643a;font-weight:700;text-transform:uppercase;letter-spacing:.08em}.title{font-size:22px;font-weight:800;margin:3px 0}.muted{color:#5d6a62}.status{align-self:flex-start;border-radius:999px;padding:6px 10px;font-weight:800}.risk-normal{background:#dcfce7;color:#166534}.risk-watch{background:#fef3c7;color:#92400e}.risk-high{background:#ffedd5;color:#9a3412}.risk-critical{background:#fee2e2;color:#991b1b}.risk-unconfigured{background:#e2e8f0;color:#334155}.meta{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin:10px 0}.meta div,.summary div{border:1px solid #b9c5bd;padding:7px;background:#f8faf8}.meta b,.summary b{display:block;font-size:9px;text-transform:uppercase;color:#526159;margin-bottom:3px}.section{background:#dce9df;border:1px solid #7c9584;font-weight:800;text-align:center;padding:5px;margin-top:10px}.layout{display:grid;grid-template-columns:minmax(720px,1.7fr) minmax(430px,1fr);gap:10px;align-items:start}table{width:100%;border-collapse:collapse}th,td{border:1px solid #536159;padding:3px 4px;text-align:center;white-space:nowrap}th{background:#dce9df;font-weight:800}.input{background:#fff8b8}.calculated{background:#e9f1f7}.quality-ok{background:#15803d;color:#fff;font-weight:800}.quality-warning{background:#f59e0b;color:#422006;font-weight:800}.quality-error{background:#dc2626;color:#fff;font-weight:800}.summary{display:grid;grid-template-columns:repeat(8,1fr);gap:6px;margin-top:10px}.summary .risk{background:#fff;border-width:2px}.legend{display:flex;gap:14px;align-items:center;margin-top:10px;color:#526159}.swatch{display:inline-block;width:13px;height:13px;border:1px solid #87928b;vertical-align:-2px;margin-right:4px}.foot{margin-top:10px;padding-top:8px;border-top:1px solid #cbd5ce;font-size:9px;color:#66736b}.print-button{position:fixed;right:18px;top:18px;background:#17643a;color:white;border:0;border-radius:6px;padding:9px 13px;font-weight:700;cursor:pointer}
    @media(max-width:900px){.layout{grid-template-columns:1fr}.meta,.summary{grid-template-columns:repeat(2,1fr)}body{padding:10px;overflow-x:auto}}@media print{@page{size:A4 landscape;margin:7mm}body{padding:0;font-size:7.4px}.page{max-width:none}.print-button{display:none}.header{margin-bottom:5px;padding-bottom:5px}.title{font-size:15px}.meta{margin:5px 0;gap:3px}.meta div,.summary div{padding:3px}.section{margin-top:5px;padding:3px}.layout{grid-template-columns:1.65fr 1fr;gap:5px}th,td{padding:1.8px 2px}.summary{gap:3px;margin-top:5px}.legend,.foot{margin-top:5px}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body><button class="print-button" onclick="window.print()">Print or save PDF</button><main class="page">
    <header class="header"><div><div class="eyebrow">Crop health intelligence</div><div class="title">Sigatoka field observation report</div><div class="muted">Stored observation and verified SED calculation snapshot</div></div><div class="status risk-${model.riskLevel}">${htmlEscape(model.riskLabel)} | SED ${displayNumber(session.metrics.sed, 0)}</div></header>
    <section class="meta"><div><b>Organization</b>${htmlEscape(options.organizationName)}</div><div><b>${htmlEscape(options.sectorLabel)}</b>${htmlEscape(session.sectorName)}</div><div><b>${htmlEscape(options.plotLabel)}</b>${htmlEscape(session.plotName)}</div><div><b>Date</b>${htmlEscape(session.observedAt)}</div><div><b>Farm week</b>${session.monitoringYear} W${session.monitoringWeek}</div><div><b>Observer / status</b>${htmlEscape(session.observerName)} | ${htmlEscape(session.status)}</div></section>
    <section class="layout"><div><div class="section">Plant readings and quality checks</div><table><thead><tr><th title="${htmlEscape(options.plantLabel)}">${htmlEscape(options.plantLabel)}</th><th title="Old Leaf Number">OLN</th><th title="New Leaf Number">NLN</th><th title="Foliar Emission Rhythm">FER</th><th>Leaf II</th><th>Leaf III</th><th>Leaf IV</th><th title="Youngest Infested Leaf">YIL</th><th title="Youngest Necrotic Leaf">YNL</th><th>Check</th><th title="Number of Leaves at Flowering">NLF</th><th title="Number of Leaves at Harvest">NLH</th></tr></thead><tbody>${plantRows}</tbody></table></div>
      <div><div class="section">Disease class calculations</div><table><thead><tr><th rowspan="2">Class</th><th colspan="3">Observed count</th><th colspan="3">Weighted score</th></tr><tr><th>II</th><th>III</th><th>IV</th><th>II</th><th>III</th><th>IV</th></tr></thead><tbody>${stageRows}<tr><th colspan="4">Total weighted score</th><th>${session.metrics.coefficientLeaf2}</th><th>${session.metrics.coefficientLeaf3}</th><th>${session.metrics.coefficientLeaf4}</th></tr><tr><th colspan="6">Gross disease coefficient</th><th>${session.metrics.grossCoefficient}</th></tr></tbody></table>
      <div class="section">Stages 4, 5 and 6 summary</div><table><thead><tr><th>Recorded position</th><th>Stage 4</th><th>Stage 5</th><th>Stage 6</th></tr></thead><tbody>${advancedRows}</tbody></table></div></section>
    <section class="summary"><div><b>Mean FER</b>${displayNumber(session.metrics.meanRawFer, 3)}</div><div><b>Interval</b>${session.intervalDays} days</div><div><b>10-day FER</b>${displayNumber(session.metrics.fer10d, 3)}</div><div><b>Previous final FER</b>${displayNumber(session.metrics.previousFinalFer, 3)}</div><div><b>Final FER</b>${displayNumber(session.metrics.finalFer, 4)}</div><div><b>Average YIL / YNL</b>${displayNumber(session.metrics.averageYil, 1)} / ${displayNumber(session.metrics.averageYnl, 1)}</div><div><b>Average NLF / NLH</b>${displayNumber(session.metrics.averageNlf, 1)} / ${displayNumber(session.metrics.averageNlh, 1)}</div><div class="risk risk-${model.riskLevel}"><b>SED / risk</b>${displayNumber(session.metrics.sed, 0)} | ${htmlEscape(model.riskLabel)}</div></section>
    <div class="legend"><span><i class="swatch" style="background:#fff8b8"></i>Recorded field value</span><span><i class="swatch" style="background:#e9f1f7"></i>System calculation</span><span><i class="swatch" style="background:#15803d"></i>Passed check</span><span><i class="swatch" style="background:#f59e0b"></i>Review</span><span><i class="swatch" style="background:#dc2626"></i>Blocking inconsistency</span></div>
    <footer class="foot">Generated ${htmlEscape(model.generatedAt)} | Calculation protocol ${htmlEscape(session.metrics.calculationVersion)} | Colors communicate recorded values, calculation output, data quality and configured risk only. Abbreviations are expanded in cell tooltips and the workbook method guide.</footer>
  </main></body></html>`;
}

export function printSigatokaFieldReport(session: SigatokaSessionRecord, options: SigatokaFieldReportOptions): void {
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('Popup blocked. Allow popups to print or save the field report as PDF.');
  popup.document.write(buildSigatokaFieldReportHtml(buildSigatokaFieldReportModel(session, options)));
  popup.document.close();
}

type ExcelCell = import('exceljs').Cell;
type ExcelWorksheet = import('exceljs').Worksheet;

const fills = {
  darkGreen: 'FF17643A',
  section: 'FFDCE9DF',
  input: 'FFFFF8B8',
  calculated: 'FFE9F1F7',
  ok: 'FF15803D',
  warning: 'FFF59E0B',
  error: 'FFDC2626',
  white: 'FFFFFFFF',
  normalRisk: 'FFDCFCE7',
  watchRisk: 'FFFEF3C7',
  highRisk: 'FFFFEDD5',
  criticalRisk: 'FFFEE2E2',
  unconfiguredRisk: 'FFE2E8F0',
} as const;

const fill = (argb: string): import('exceljs').Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const border: Partial<import('exceljs').Borders> = {
  top: { style: 'thin', color: { argb: 'FF758078' } },
  left: { style: 'thin', color: { argb: 'FF758078' } },
  bottom: { style: 'thin', color: { argb: 'FF758078' } },
  right: { style: 'thin', color: { argb: 'FF758078' } },
};

function styleHeader(cell: ExcelCell, dark = false): void {
  cell.fill = fill(dark ? fills.darkGreen : fills.section);
  cell.font = { bold: true, color: { argb: dark ? fills.white : 'FF17201B' }, size: dark ? 16 : 9 };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.border = border;
}

function styleRange(worksheet: ExcelWorksheet, fromRow: number, toRow: number, fromColumn: number, toColumn: number): void {
  for (let row = fromRow; row <= toRow; row++) {
    for (let column = fromColumn; column <= toColumn; column++) {
      const cell = worksheet.getCell(row, column);
      cell.border = border;
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.font = { size: 9 };
    }
  }
}

function riskFill(level: RiskLevel): string {
  return ({ normal: fills.normalRisk, watch: fills.watchRisk, high: fills.highRisk, critical: fills.criticalRisk, unconfigured: fills.unconfiguredRisk })[level];
}

export async function buildSigatokaFieldWorkbook(session: SigatokaSessionRecord, options: SigatokaFieldReportOptions): Promise<import('exceljs').Workbook> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'IntelliStock';
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  const model = buildSigatokaFieldReportModel(session, options);
  const worksheet = workbook.addWorksheet('Observation', {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: 0.2, right: 0.2, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 } },
    views: [{ state: 'frozen', ySplit: 6 }],
  });
  worksheet.properties.defaultRowHeight = 16;
  const widths = [10, 9, 9, 8, 8, 8, 8, 8, 8, 12, 8, 8, 16, 2, 8, 8, 8, 8, 9, 9, 9, 2, 12, 9, 9, 9];
  widths.forEach((width, index) => { worksheet.getColumn(index + 1).width = width; });

  worksheet.mergeCells('A1:Z1');
  worksheet.getCell('A1').value = 'SIGATOKA FIELD OBSERVATION REPORT';
  styleHeader(worksheet.getCell('A1'), true);
  worksheet.getRow(1).height = 26;
  const meta = [
    ['A2', 'Organization', 'B2:D2', options.organizationName], ['E2', options.sectorLabel, 'F2:H2', session.sectorName], ['I2', options.plotLabel, 'J2:L2', session.plotName],
    ['M2', 'Date', 'N2:P2', session.observedAt], ['Q2', 'Farm week', 'R2:T2', `${session.monitoringYear} W${session.monitoringWeek}`], ['U2', 'Observer / status', 'V2:Z2', `${session.observerName} / ${session.status}`],
  ] as const;
  for (const [labelCell, label, valueRange, value] of meta) {
    worksheet.getCell(labelCell).value = label;
    styleHeader(worksheet.getCell(labelCell));
    worksheet.mergeCells(valueRange);
    const valueCell = worksheet.getCell(valueRange.split(':')[0]);
    valueCell.value = value;
    valueCell.fill = fill(fills.input);
    valueCell.border = border;
    valueCell.alignment = { vertical: 'middle', horizontal: 'left' };
    valueCell.font = { size: 9, bold: true };
  }
  worksheet.mergeCells('A4:M4'); worksheet.getCell('A4').value = 'PLANT READINGS AND QUALITY CHECKS'; styleHeader(worksheet.getCell('A4'));
  worksheet.mergeCells('O4:U4'); worksheet.getCell('O4').value = 'DISEASE CLASS CALCULATIONS'; styleHeader(worksheet.getCell('O4'));
  worksheet.mergeCells('W4:Z4'); worksheet.getCell('W4').value = 'STAGES 4, 5 AND 6 SUMMARY'; styleHeader(worksheet.getCell('W4'));
  worksheet.mergeCells('A5:A6'); worksheet.getCell('A5').value = options.plantLabel;
  const mainHeaders = [['B5', 'Old Leaf Number\n(OLN)'], ['C5', 'New Leaf Number\n(NLN)'], ['D5', 'Foliar Emission\n(FER)'], ['E5', 'Leaf II'], ['F5', 'Leaf III'], ['G5', 'Leaf IV'], ['H5', 'Youngest Infested\n(YIL)'], ['I5', 'Youngest Necrotic\n(YNL)'], ['J5', 'Quality check'], ['K5', 'Leaves at Flowering\n(NLF)'], ['L5', 'Leaves at Harvest\n(NLH)'], ['M5', 'Notes']] as const;
  worksheet.mergeCells('B5:B6'); worksheet.mergeCells('C5:C6'); worksheet.mergeCells('D5:D6'); worksheet.mergeCells('E5:E6'); worksheet.mergeCells('F5:F6'); worksheet.mergeCells('G5:G6'); worksheet.mergeCells('H5:H6'); worksheet.mergeCells('I5:I6'); worksheet.mergeCells('J5:J6'); worksheet.mergeCells('K5:K6'); worksheet.mergeCells('L5:L6'); worksheet.mergeCells('M5:M6');
  for (const [cell, label] of mainHeaders) worksheet.getCell(cell).value = label;
  for (let column = 1; column <= 13; column++) styleHeader(worksheet.getCell(5, column));
  worksheet.mergeCells('O5:O6'); worksheet.getCell('O5').value = 'Class'; worksheet.mergeCells('P5:R5'); worksheet.getCell('P5').value = 'Observed count'; worksheet.mergeCells('S5:U5'); worksheet.getCell('S5').value = 'Weighted score';
  ['II', 'III', 'IV', 'II', 'III', 'IV'].forEach((label, index) => { worksheet.getCell(6, 16 + index).value = label; });
  for (let column = 15; column <= 21; column++) { styleHeader(worksheet.getCell(5, column)); styleHeader(worksheet.getCell(6, column)); }
  worksheet.mergeCells('W5:W6'); worksheet.getCell('W5').value = 'Recorded position';
  ['Stage 4', 'Stage 5', 'Stage 6'].forEach((label, index) => { worksheet.mergeCells(5, 24 + index, 6, 24 + index); worksheet.getCell(5, 24 + index).value = label; });
  for (let column = 23; column <= 26; column++) styleHeader(worksheet.getCell(5, column));

  const plantStart = 7;
  const plantEnd = plantStart + model.plantRows.length - 1;
  model.plantRows.forEach((plant, index) => {
    const rowNumber = plantStart + index;
    const values = [plant.plantCode || plant.plantNumber, plant.previousLeafReading, plant.currentLeafReading, null, plant.leaf2, plant.leaf3, plant.leaf4, plant.youngestInfestedLeaf, plant.youngestNecroticLeaf, plant.qualityLabel, plant.leavesAtFlowering, plant.leavesAtHarvest, plant.notes];
    values.forEach((value, columnIndex) => { worksheet.getCell(rowNumber, columnIndex + 1).value = value; });
    worksheet.getCell(rowNumber, 4).value = { formula: `C${rowNumber}-B${rowNumber}`, result: plant.fer };
    for (const column of [2, 3, 5, 6, 7, 8, 9, 11, 12, 13]) worksheet.getCell(rowNumber, column).fill = fill(fills.input);
    worksheet.getCell(rowNumber, 4).fill = fill(fills.calculated);
    const qualityCell = worksheet.getCell(rowNumber, 10);
    qualityCell.fill = fill(plant.qualityLevel === 'ok' ? fills.ok : plant.qualityLevel === 'warning' ? fills.warning : fills.error);
    qualityCell.font = { bold: true, color: { argb: plant.qualityLevel === 'warning' ? 'FF422006' : fills.white }, size: 9 };
    qualityCell.note = plant.qualityMessage;
  });
  styleRange(worksheet, plantStart, plantEnd, 1, 13);

  model.stageRows.forEach((stage, index) => {
    const rowNumber = 7 + index;
    const guideRow = 2 + index;
    worksheet.getCell(rowNumber, 15).value = stage.label;
    [stage.leaf2Count, stage.leaf3Count, stage.leaf4Count].forEach((count, position) => {
      const observedColumn = 16 + position;
      const sourceColumn = ['E', 'F', 'G'][position];
      worksheet.getCell(rowNumber, observedColumn).value = { formula: `COUNTIF($${sourceColumn}$${plantStart}:$${sourceColumn}$${plantEnd},O${rowNumber})`, result: count };
      worksheet.getCell(rowNumber, 19 + position).value = { formula: `${String.fromCharCode(80 + position)}${rowNumber}*'Method Guide'!${String.fromCharCode(66 + position)}${guideRow}`, result: [stage.leaf2Score, stage.leaf3Score, stage.leaf4Score][position] };
    });
  });
  styleRange(worksheet, 7, 18, 15, 21);
  for (let row = 7; row <= 18; row++) for (let column = 16; column <= 21; column++) worksheet.getCell(row, column).fill = fill(fills.calculated);
  const stageTotalRow = 19;
  worksheet.mergeCells(`O${stageTotalRow}:R${stageTotalRow}`); worksheet.getCell(`O${stageTotalRow}`).value = 'Total weighted score'; styleHeader(worksheet.getCell(`O${stageTotalRow}`));
  [session.metrics.coefficientLeaf2, session.metrics.coefficientLeaf3, session.metrics.coefficientLeaf4].forEach((value, index) => {
    const column = String.fromCharCode(83 + index);
    worksheet.getCell(`${column}${stageTotalRow}`).value = { formula: `SUM(${column}7:${column}18)`, result: value };
    worksheet.getCell(`${column}${stageTotalRow}`).fill = fill(fills.calculated);
    worksheet.getCell(`${column}${stageTotalRow}`).border = border;
  });
  worksheet.mergeCells('O20:T20'); worksheet.getCell('O20').value = 'Gross disease coefficient'; styleHeader(worksheet.getCell('O20'));
  worksheet.getCell('U20').value = { formula: 'SUM(S19:U19)', result: session.metrics.grossCoefficient }; worksheet.getCell('U20').fill = fill(fills.calculated); worksheet.getCell('U20').border = border;

  model.advancedStageRows.forEach((row, index) => {
    const rowNumber = 7 + index;
    [row.leafPosition, row.stage4, row.stage5, row.stage6].forEach((value, columnIndex) => { worksheet.getCell(rowNumber, 23 + columnIndex).value = value; });
  });
  styleRange(worksheet, 7, 9, 23, 26);
  for (let row = 7; row <= 9; row++) for (let column = 24; column <= 26; column++) worksheet.getCell(row, column).fill = fill(fills.calculated);

  const summaryStart = Math.max(plantEnd + 2, 22);
  const summaries: Array<[string, number | string | null, string | null]> = [
    ['Mean FER used', session.metrics.meanRawFer, session.meanRawFerOverride === null || session.meanRawFerOverride === undefined ? `AVERAGE(D${plantStart}:D${plantEnd})` : null],
    ['Observation interval', session.intervalDays, null],
    ['10-day FER', session.metrics.fer10d, `B${summaryStart}/B${summaryStart + 1}*10`],
    ['Previous final FER', session.metrics.previousFinalFer, null],
    ['Final FER', session.metrics.finalFer, `AVERAGE(B${summaryStart + 2},B${summaryStart + 3})`],
    ['Average YIL', session.metrics.averageYil, `IFERROR(AVERAGE(H${plantStart}:H${plantEnd}),"")`],
    ['Average YNL', session.metrics.averageYnl, `IFERROR(AVERAGE(I${plantStart}:I${plantEnd}),"")`],
    ['Average NLF', session.metrics.averageNlf, `IFERROR(AVERAGE(K${plantStart}:K${plantEnd}),"")`],
    ['Average NLH', session.metrics.averageNlh, `IFERROR(AVERAGE(L${plantStart}:L${plantEnd}),"")`],
    ['Gross coefficient', session.metrics.grossCoefficient, 'U20'],
    ['SED', session.metrics.sed, `B${summaryStart + 4}*B${summaryStart + 9}`],
    ['Risk', model.riskLabel, null],
  ];
  summaries.forEach(([label, result, formula], index) => {
    const row = summaryStart + index;
    worksheet.getCell(row, 1).value = label;
    styleHeader(worksheet.getCell(row, 1));
    const valueCell = worksheet.getCell(row, 2);
    valueCell.value = formula ? { formula, result: result ?? '' } : result ?? '-';
    valueCell.fill = fill(index >= 10 ? riskFill(model.riskLevel) : fills.calculated);
    valueCell.border = border;
    valueCell.font = { bold: true, size: index >= 10 ? 11 : 9 };
    valueCell.alignment = { horizontal: 'center' };
  });
  worksheet.mergeCells(summaryStart, 4, summaryStart, 13); worksheet.getCell(summaryStart, 4).value = 'COLOR KEY'; styleHeader(worksheet.getCell(summaryStart, 4));
  const legend = [['Recorded field value', fills.input], ['System calculation', fills.calculated], ['Passed check', fills.ok], ['Review', fills.warning], ['Blocking inconsistency', fills.error]] as const;
  legend.forEach(([label, color], index) => {
    const row = summaryStart + 1 + index;
    worksheet.mergeCells(row, 4, row, 13);
    const cell = worksheet.getCell(row, 4);
    cell.value = label;
    cell.fill = fill(color);
    cell.border = border;
    cell.font = { bold: true, color: { argb: color === fills.ok || color === fills.error ? fills.white : 'FF17201B' } };
  });
  worksheet.mergeCells(summaryStart + 7, 4, summaryStart + 9, 13);
  const noteCell = worksheet.getCell(summaryStart + 7, 4);
  noteCell.value = `Generated ${model.generatedAt}. Calculation protocol ${session.metrics.calculationVersion}. This report is a snapshot of the stored observation; edit the source record in IntelliStock and regenerate rather than changing calculated cells.`;
  noteCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
  noteCell.border = border;
  noteCell.fill = fill(fills.section);
  worksheet.pageSetup.printArea = `A1:Z${summaryStart + summaries.length - 1}`;
  worksheet.headerFooter.oddFooter = '&LIntelliStock crop health intelligence&CPage &P of &N&RStored observation report';

  const guide = workbook.addWorksheet('Method Guide', { views: [{ state: 'frozen', ySplit: 1 }] });
  guide.columns = [{ width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 28 }, { width: 72 }];
  ['Disease class', 'Leaf II coefficient', 'Leaf III coefficient', 'Leaf IV coefficient', 'Meaning', 'Use'].forEach((label, index) => { guide.getCell(1, index + 1).value = label; styleHeader(guide.getCell(1, index + 1), true); });
  model.stageRows.forEach((stage, index) => {
    const row = index + 2;
    guide.getCell(row, 1).value = stage.label;
    guide.getCell(row, 2).value = sigatokaCoefficient(stage, 2);
    guide.getCell(row, 3).value = sigatokaCoefficient(stage, 3);
    guide.getCell(row, 4).value = sigatokaCoefficient(stage, 4);
    guide.getCell(row, 5).value = stage.density === 'high' ? 'Higher lesion density (approximately over 50 lesions)' : 'Lower lesion density (approximately under 50 lesions)';
    guide.getCell(row, 6).value = 'The same disease class carries more weight on a younger leaf position.';
  });
  const glossaryStart = 16;
  const glossary = [
    ['BTN', 'Monitored plant identifier'], ['OLN', 'Old Leaf Number'], ['NLN', 'New Leaf Number'], ['FER', 'Foliar Emission Rhythm'], ['YIL', 'Youngest Infested Leaf'], ['YNL', 'Youngest Necrotic Leaf'], ['NLF', 'Number of Leaves at Flowering'], ['NLH', 'Number of Leaves at Harvest'], ['SED', 'Stage of Evolution of Disease'],
  ];
  glossary.forEach(([short, meaning], index) => { guide.getCell(glossaryStart + index, 1).value = short; guide.getCell(glossaryStart + index, 2).value = meaning; guide.mergeCells(glossaryStart + index, 2, glossaryStart + index, 6); });
  styleRange(guide, 2, 13, 1, 6); styleRange(guide, glossaryStart, glossaryStart + glossary.length - 1, 1, 6);
  for (let row = glossaryStart; row < glossaryStart + glossary.length; row++) { guide.getCell(row, 1).font = { bold: true }; guide.getCell(row, 1).fill = fill(fills.section); }
  guide.autoFilter = 'A1:F13';
  return workbook;
}

const filenamePart = (value: string) => value.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'observation';

export async function downloadSigatokaFieldWorkbook(session: SigatokaSessionRecord, options: SigatokaFieldReportOptions): Promise<void> {
  const workbook = await buildSigatokaFieldWorkbook(session, options);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(buffer as ArrayBuffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `sigatoka-field-report-${filenamePart(session.plotName)}-${session.observedAt}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
