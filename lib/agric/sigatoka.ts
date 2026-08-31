export const SIGATOKA_CALCULATION_VERSION = 'legacy-sed-v1' as const;

export type SigatokaDensity = 'low' | 'high';
export type SigatokaLeafPosition = 2 | 3 | 4;

export interface SigatokaLeafScore {
  stage: 1 | 2 | 3 | 4 | 5 | 6;
  density: SigatokaDensity;
}

export interface SigatokaPlantObservation {
  plantNumber: number;
  sentinelPlantId?: string;
  sentinelPlantCode?: string;
  previousLeafReading: number;
  currentLeafReading: number;
  leaf2: SigatokaLeafScore | null;
  leaf3: SigatokaLeafScore | null;
  leaf4: SigatokaLeafScore | null;
  youngestInfestedLeaf: number | null;
  youngestNecroticLeaf: number | null;
  leavesAtFlowering: number | null;
  leavesAtHarvest: number | null;
  notes?: string;
}

export interface SigatokaAdvancedStageLeafCount {
  leafNumber: number;
  stage4Count: number | null;
  stage5Count: number | null;
  stage6Count: number | null;
}

export interface SigatokaAdvancedStageObservation {
  plantNumber: number;
  sentinelPlantId?: string;
  leafCounts: SigatokaAdvancedStageLeafCount[];
}

export const SIGATOKA_ADVANCED_LEAF_NUMBERS = [5, 6, 7, 8, 9, 10, 11, 12, 13] as const;

export function createEmptySigatokaAdvancedStageLeafCounts(): SigatokaAdvancedStageLeafCount[] {
  return SIGATOKA_ADVANCED_LEAF_NUMBERS.map(leafNumber => ({ leafNumber, stage4Count: null, stage5Count: null, stage6Count: null }));
}

function validAdvancedStageCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function normalizeSigatokaAdvancedStageObservation(
  observation: SigatokaAdvancedStageObservation | null | undefined,
  plants: SigatokaPlantObservation[],
): SigatokaAdvancedStageObservation | null {
  if (!observation) return null;
  const selectedPlant = plants.find(plant => Boolean(observation.sentinelPlantId) && plant.sentinelPlantId === observation.sentinelPlantId)
    ?? plants.find(plant => plant.plantNumber === observation.plantNumber);
  if (!selectedPlant) return null;
  const sourceRows = Array.isArray(observation.leafCounts) ? observation.leafCounts : [];
  const seen = new Set<number>();
  const rowsByLeaf = new Map<number, SigatokaAdvancedStageLeafCount>();
  sourceRows.forEach(row => {
    if (!row || !SIGATOKA_ADVANCED_LEAF_NUMBERS.includes(row.leafNumber as typeof SIGATOKA_ADVANCED_LEAF_NUMBERS[number]) || seen.has(row.leafNumber)) return;
    seen.add(row.leafNumber);
    rowsByLeaf.set(row.leafNumber, {
      leafNumber: row.leafNumber,
      stage4Count: validAdvancedStageCount(row.stage4Count) ? row.stage4Count : null,
      stage5Count: validAdvancedStageCount(row.stage5Count) ? row.stage5Count : null,
      stage6Count: validAdvancedStageCount(row.stage6Count) ? row.stage6Count : null,
    });
  });
  return {
    plantNumber: selectedPlant.plantNumber,
    ...(selectedPlant.sentinelPlantId ? { sentinelPlantId: selectedPlant.sentinelPlantId } : {}),
    leafCounts: createEmptySigatokaAdvancedStageLeafCounts().map(emptyRow => rowsByLeaf.get(emptyRow.leafNumber) ?? emptyRow),
  };
}

export function validateSigatokaAdvancedStageObservation(
  observation: SigatokaAdvancedStageObservation | null | undefined,
  plants: SigatokaPlantObservation[],
): string[] {
  if (!observation) return [];
  const issues: string[] = [];
  const selectedPlant = plants.find(plant => Boolean(observation.sentinelPlantId) && plant.sentinelPlantId === observation.sentinelPlantId)
    ?? plants.find(plant => plant.plantNumber === observation.plantNumber);
  if (!selectedPlant) issues.push('Select a sampled plant for the detailed stage 4-6 observation.');
  const rows = Array.isArray(observation.leafCounts) ? observation.leafCounts : [];
  const leafNumbers = rows.map(row => row?.leafNumber);
  if (rows.length !== SIGATOKA_ADVANCED_LEAF_NUMBERS.length
    || SIGATOKA_ADVANCED_LEAF_NUMBERS.some(leafNumber => leafNumbers.filter(value => value === leafNumber).length !== 1)) {
    issues.push('Detailed observations must contain one row for every leaf from 5 through 13.');
  }
  if (rows.some(row => !row || [row.stage4Count, row.stage5Count, row.stage6Count].some(value => value !== null && !validAdvancedStageCount(value)))) {
    issues.push('Detailed stage counts must be zero or positive whole numbers.');
  }
  if (!rows.some(row => row && [row.stage4Count, row.stage5Count, row.stage6Count].some(value => validAdvancedStageCount(value)))) {
    issues.push('Enter at least one detailed stage 4-6 count, including zero when none were observed.');
  }
  return issues;
}

export interface SigatokaMetrics {
  meanRawFer: number;
  fer10d: number;
  previousFinalFer: number;
  finalFer: number;
  coefficientLeaf2: number;
  coefficientLeaf3: number;
  coefficientLeaf4: number;
  grossCoefficient: number;
  sed: number;
  averageYil: number | null;
  averageYnl: number | null;
  averageNlf: number | null;
  averageNlh: number | null;
  highDensityCount: number;
  harvestDistribution: {
    under3: number;
    from3To5: number;
    over5: number;
    counted: number;
  };
  calculationVersion: typeof SIGATOKA_CALCULATION_VERSION;
}

export interface SigatokaValidationIssue {
  plantNumber: number;
  severity: 'error' | 'warning';
  message: string;
}

export interface SigatokaDecisionAlert {
  id: string;
  plotName: string;
  severity: 'warning' | 'critical';
  title: string;
  explanation: string;
  observedAt: string;
}

export interface SigatokaSessionRecord {
  id: string;
  sectorName: string;
  plotName: string;
  plotArea: number | null;
  plotAreaSquareMetres: number | null;
  areaUnit: string;
  observedAt: string;
  monitoringWeek: number;
  monitoringYear: number;
  observerId: string;
  observerName: string;
  intervalDays: number;
  meanRawFerOverride?: number | null;
  status: 'draft' | 'submitted' | 'verified';
  plants: SigatokaPlantObservation[];
  advancedStageObservation?: SigatokaAdvancedStageObservation | null;
  metrics: SigatokaMetrics;
  rainfallMm?: number | null;
  treatment?: {
    appliedAt: string;
    product: string;
    activeIngredient?: string;
    dose?: string;
    method?: string;
  } | null;
  notes?: string;
  verifiedBy?: string;
  verifiedAt?: unknown;
  archivedAt?: unknown;
  archivedAtIso?: string;
  archivedBy?: string;
  archiveReason?: string;
  archiveBatchId?: string;
  expireAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SigatokaWeeklySummary {
  key: string;
  year: number;
  week: number;
  observations: number;
  plots: number;
  sedMean: number;
  sedMin: number;
  sedMax: number;
  averageYil: number | null;
  averageYnl: number | null;
  averageNlf: number | null;
  averageNlh: number | null;
  averageFer: number;
  highDensityCount: number;
  possibleHighDensityCount: number;
  rainfallMm: number | null;
  treatments: NonNullable<SigatokaSessionRecord['treatment']>[];
  harvestDistribution: SigatokaMetrics['harvestDistribution'];
}

const COEFFICIENTS: Record<string, Record<SigatokaLeafPosition, number>> = {
  '1-low': { 2: 60, 3: 40, 4: 20 },
  '1-high': { 2: 100, 3: 80, 4: 60 },
  '2-low': { 2: 100, 3: 80, 4: 60 },
  '2-high': { 2: 140, 3: 120, 4: 100 },
  '3-low': { 2: 140, 3: 120, 4: 100 },
  '3-high': { 2: 180, 3: 160, 4: 140 },
  '4-low': { 2: 180, 3: 160, 4: 140 },
  '4-high': { 2: 220, 3: 200, 4: 180 },
  '5-low': { 2: 220, 3: 200, 4: 180 },
  '5-high': { 2: 260, 3: 240, 4: 220 },
  '6-low': { 2: 260, 3: 240, 4: 220 },
  '6-high': { 2: 300, 3: 280, 4: 260 },
};

function average(values: Array<number | null>): number | null {
  const usable = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return usable.length ? usable.reduce((total, value) => total + value, 0) / usable.length : null;
}

export function sigatokaCoefficient(score: SigatokaLeafScore | null, leafPosition: SigatokaLeafPosition): number {
  if (!score) return 0;
  return COEFFICIENTS[`${score.stage}-${score.density}`]?.[leafPosition] ?? 0;
}

export function calculateSigatokaMetrics(
  plants: SigatokaPlantObservation[],
  intervalDays: number,
  previousFinalFer: number,
  meanRawFerOverride?: number | null,
): SigatokaMetrics {
  if (!plants.length) throw new Error('At least one plant observation is required.');
  if (!Number.isFinite(intervalDays) || intervalDays <= 0) throw new Error('Observation interval must be greater than zero.');
  if (!Number.isFinite(previousFinalFer) || previousFinalFer < 0) throw new Error('Previous final FER must be zero or greater.');

  const rawFer = plants.map(plant => plant.currentLeafReading - plant.previousLeafReading);
  const calculatedMeanRawFer = rawFer.reduce((total, value) => total + value, 0) / plants.length;
  const meanRawFer = meanRawFerOverride !== null && meanRawFerOverride !== undefined && Number.isFinite(meanRawFerOverride) && meanRawFerOverride >= 0
    ? meanRawFerOverride
    : calculatedMeanRawFer;
  const fer10d = meanRawFer / intervalDays * 10;
  const finalFer = (previousFinalFer + fer10d) / 2;
  const coefficientLeaf2 = plants.reduce((total, plant) => total + sigatokaCoefficient(plant.leaf2, 2), 0);
  const coefficientLeaf3 = plants.reduce((total, plant) => total + sigatokaCoefficient(plant.leaf3, 3), 0);
  const coefficientLeaf4 = plants.reduce((total, plant) => total + sigatokaCoefficient(plant.leaf4, 4), 0);
  const grossCoefficient = coefficientLeaf2 + coefficientLeaf3 + coefficientLeaf4;
  const harvestValues = plants.map(plant => plant.leavesAtHarvest).filter((value): value is number => value !== null);

  return {
    meanRawFer,
    fer10d,
    previousFinalFer,
    finalFer,
    coefficientLeaf2,
    coefficientLeaf3,
    coefficientLeaf4,
    grossCoefficient,
    sed: grossCoefficient * finalFer,
    averageYil: average(plants.map(plant => plant.youngestInfestedLeaf)),
    averageYnl: average(plants.map(plant => plant.youngestNecroticLeaf)),
    averageNlf: average(plants.map(plant => plant.leavesAtFlowering)),
    averageNlh: average(plants.map(plant => plant.leavesAtHarvest)),
    highDensityCount: plants.reduce((total, plant) => total + [plant.leaf2, plant.leaf3, plant.leaf4].filter(score => score?.density === 'high').length, 0),
    harvestDistribution: {
      under3: harvestValues.filter(value => value < 3).length,
      from3To5: harvestValues.filter(value => value >= 3 && value <= 5).length,
      over5: harvestValues.filter(value => value > 5).length,
      counted: harvestValues.length,
    },
    calculationVersion: SIGATOKA_CALCULATION_VERSION,
  };
}

export function validateSigatokaPlants(plants: SigatokaPlantObservation[], previousPlants: SigatokaPlantObservation[] = [], meanRawFerOverride?: number | null): SigatokaValidationIssue[] {
  const previousByNumber = new Map(previousPlants.map(plant => [plant.plantNumber, plant]));
  return plants.flatMap(plant => {
    const issues: SigatokaValidationIssue[] = [];
    const fer = plant.currentLeafReading - plant.previousLeafReading;
    if (fer < 0 && (meanRawFerOverride === null || meanRawFerOverride === undefined)) issues.push({ plantNumber: plant.plantNumber, severity: 'error', message: 'Current leaf reading cannot be below the previous reading.' });
    if (fer < 0 && meanRawFerOverride !== null && meanRawFerOverride !== undefined) issues.push({ plantNumber: plant.plantNumber, severity: 'warning', message: 'A verified historical mean FER override is being used for this plant-number reset.' });
    if (fer > 3) issues.push({ plantNumber: plant.plantNumber, severity: 'warning', message: 'Leaf emission exceeds 3.0; verify the readings or observation interval.' });
    if (plant.youngestInfestedLeaf !== null && plant.youngestNecroticLeaf !== null && plant.youngestInfestedLeaf > plant.youngestNecroticLeaf) {
      issues.push({ plantNumber: plant.plantNumber, severity: 'error', message: 'Youngest infested leaf cannot be older than the youngest necrotic leaf.' });
    }
    const previous = previousByNumber.get(plant.plantNumber);
    const allowedOlderShift = Math.max(2, Math.ceil(Math.max(0, fer)));
    if (previous?.youngestInfestedLeaf !== null && previous?.youngestInfestedLeaf !== undefined && plant.youngestInfestedLeaf !== null && plant.youngestInfestedLeaf - previous.youngestInfestedLeaf > allowedOlderShift) {
      issues.push({ plantNumber: plant.plantNumber, severity: 'warning', message: 'YIL moved farther than the recorded leaf emission explains; verify the leaf position.' });
    }
    if (previous?.youngestNecroticLeaf !== null && previous?.youngestNecroticLeaf !== undefined && plant.youngestNecroticLeaf !== null && plant.youngestNecroticLeaf - previous.youngestNecroticLeaf > allowedOlderShift) {
      issues.push({ plantNumber: plant.plantNumber, severity: 'warning', message: 'YNL moved farther than the recorded leaf emission explains; verify the leaf position.' });
    }
    return issues;
  });
}

export function diseaseClassLabel(score: SigatokaLeafScore | null): string {
  if (!score) return 'None';
  return `${score.stage}${score.density === 'high' ? '+' : '-'}`;
}

export function convertArea(value: number, fromSquareMetres: number, toSquareMetres: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error('Area must be zero or greater.');
  if (fromSquareMetres <= 0 || toSquareMetres <= 0) throw new Error('Area conversion factors must be greater than zero.');
  return value * fromSquareMetres / toSquareMetres;
}

export function aggregateSigatokaSessions(sessions: SigatokaSessionRecord[]): SigatokaWeeklySummary[] {
  const submitted = sessions.filter(session => session.status !== 'draft');
  const grouped = new Map<string, SigatokaSessionRecord[]>();
  for (const session of submitted) {
    const key = `${session.monitoringYear}-${String(session.monitoringWeek).padStart(2, '0')}`;
    grouped.set(key, [...(grouped.get(key) ?? []), session]);
  }

  return Array.from(grouped.entries()).map(([key, records]) => {
    const sedValues = records.map(record => record.metrics.sed);
    const rainfallValues = records.map(record => record.rainfallMm).filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
    const harvestDistribution = records.reduce((total, record) => ({
      under3: total.under3 + record.metrics.harvestDistribution.under3,
      from3To5: total.from3To5 + record.metrics.harvestDistribution.from3To5,
      over5: total.over5 + record.metrics.harvestDistribution.over5,
      counted: total.counted + record.metrics.harvestDistribution.counted,
    }), { under3: 0, from3To5: 0, over5: 0, counted: 0 });

    return {
      key,
      year: records[0].monitoringYear,
      week: records[0].monitoringWeek,
      observations: records.length,
      plots: new Set(records.map(record => record.plotName)).size,
      sedMean: sedValues.reduce((total, value) => total + value, 0) / sedValues.length,
      sedMin: Math.min(...sedValues),
      sedMax: Math.max(...sedValues),
      averageYil: average(records.map(record => record.metrics.averageYil)),
      averageYnl: average(records.map(record => record.metrics.averageYnl)),
      averageNlf: average(records.map(record => record.metrics.averageNlf)),
      averageNlh: average(records.map(record => record.metrics.averageNlh)),
      averageFer: records.reduce((total, record) => total + record.metrics.finalFer, 0) / records.length,
      highDensityCount: records.reduce((total, record) => total + record.metrics.highDensityCount, 0),
      possibleHighDensityCount: records.reduce((total, record) => total + record.plants.length * 3, 0),
      rainfallMm: rainfallValues.length ? rainfallValues.reduce((total, value) => total + value, 0) / rainfallValues.length : null,
      treatments: records.flatMap(record => record.treatment ? [record.treatment] : []),
      harvestDistribution,
    };
  }).sort((a, b) => a.key.localeCompare(b.key));
}

export function generateSigatokaDecisionAlerts(
  sessions: SigatokaSessionRecord[],
  thresholds: { watch: number | null; high: number | null; critical: number | null },
  expectedIntervalDays = 7,
  asOf = new Date(),
): SigatokaDecisionAlert[] {
  const byPlot = new Map<string, SigatokaSessionRecord[]>();
  for (const session of sessions.filter(item => item.status !== 'draft')) {
    byPlot.set(session.plotName, [...(byPlot.get(session.plotName) ?? []), session]);
  }

  const alerts: SigatokaDecisionAlert[] = [];
  for (const [plotName, records] of byPlot) {
    records.sort((a, b) => b.observedAt.localeCompare(a.observedAt));
    const latest = records[0];
    const previous = records[1];
    const ageDays = Math.max(0, Math.floor((asOf.getTime() - new Date(`${latest.observedAt}T12:00:00`).getTime()) / 86400000));

    if (ageDays > expectedIntervalDays + 1) {
      alerts.push({ id: `${plotName}-overdue`, plotName, severity: ageDays > expectedIntervalDays * 2 ? 'critical' : 'warning', title: 'Observation overdue', explanation: `Last completed ${ageDays} days ago; the expected interval is ${expectedIntervalDays} days.`, observedAt: latest.observedAt });
    }

    const sed = latest.metrics.sed;
    const severity = thresholds.critical !== null && sed >= thresholds.critical
      ? 'critical'
      : thresholds.high !== null && sed >= thresholds.high
        ? 'critical'
        : thresholds.watch !== null && sed >= thresholds.watch ? 'warning' : null;
    if (severity) {
      alerts.push({ id: `${plotName}-threshold-${latest.id}`, plotName, severity, title: severity === 'critical' ? 'SED requires action' : 'SED needs attention', explanation: `SED is ${sed.toFixed(0)}, above an organization attention threshold.`, observedAt: latest.observedAt });
    }

    if (previous && previous.metrics.sed > 0) {
      const change = (sed - previous.metrics.sed) / previous.metrics.sed * 100;
      const reasons: string[] = [];
      if (change >= 20) reasons.push(`SED rose ${change.toFixed(0)}%`);
      if (latest.metrics.averageYil !== null && previous.metrics.averageYil !== null && previous.metrics.averageYil - latest.metrics.averageYil >= 0.75) reasons.push(`YIL moved ${(previous.metrics.averageYil - latest.metrics.averageYil).toFixed(1)} leaves younger`);
      if (latest.metrics.highDensityCount - previous.metrics.highDensityCount >= 3) reasons.push(`D+ increased by ${latest.metrics.highDensityCount - previous.metrics.highDensityCount}`);
      if (reasons.length) alerts.push({ id: `${plotName}-trend-${latest.id}`, plotName, severity: reasons.length >= 2 || change >= 40 ? 'critical' : 'warning', title: 'Disease pressure is worsening', explanation: `${reasons.join('; ')} compared with the previous observation.`, observedAt: latest.observedAt });
    }

    if ((latest.rainfallMm ?? 0) >= 50) {
      alerts.push({ id: `${plotName}-rain-${latest.id}`, plotName, severity: 'warning', title: 'High rainfall pressure', explanation: `${latest.rainfallMm?.toFixed(1)} mm rainfall was recorded for this observation interval. Review disease progression and treatment timing.`, observedAt: latest.observedAt });
    }
  }

  return alerts.sort((a, b) => Number(b.severity === 'critical') - Number(a.severity === 'critical') || b.observedAt.localeCompare(a.observedAt));
}
