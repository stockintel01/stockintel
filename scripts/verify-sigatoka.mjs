import assert from 'node:assert/strict';
import { aggregateSigatokaSessions, calculateSigatokaMetrics, convertArea, createEmptySigatokaAdvancedStageLeafCounts, generateSigatokaDecisionAlerts, normalizeSigatokaAdvancedStageObservation, sigatokaCoefficient, summarizeSigatokaAdvancedStageObservation, validateSigatokaAdvancedStageObservation, validateSigatokaPlants } from '../lib/agric/sigatoka.ts';

const score = value => value ? {
  stage: Number(value[0]),
  density: value[1] === '+' ? 'high' : 'low',
} : null;

const sourceRows = [
  [20.2, 21.2, '2-', '2+', '3+', 2, 6],
  [20.4, 21.2, null, '2+', '3+', 3, 5],
  [21.4, 22.4, '1-', '2+', '3+', 2, 7],
  [20.4, 21.4, null, '2+', '2+', 3, 6],
  [19.2, 20.4, '2-', '2+', '3+', 2, 6],
  [21.4, 22.2, null, '2-', '2+', 3, 5],
  [19.6, 20.6, null, '2-', '6+', 3, 4],
  [19.2, 20.2, '2-', '2+', '3+', 2, 6],
  [19.2, 20.4, '2-', '2+', '3+', 2, 6],
  [19.6, 20.8, '1-', '2+', '3+', 2, 6],
];

const plants = sourceRows.map((row, index) => ({
  plantNumber: index + 1,
  previousLeafReading: row[0],
  currentLeafReading: row[1],
  leaf2: score(row[2]),
  leaf3: score(row[3]),
  leaf4: score(row[4]),
  youngestInfestedLeaf: row[5],
  youngestNecroticLeaf: row[6],
  leavesAtFlowering: null,
  leavesAtHarvest: null,
}));

const metrics = calculateSigatokaMetrics(plants, 9, 1.17);
assert.equal(sigatokaCoefficient({ stage: 3, density: 'high' }, 3), 160);
assert.equal(metrics.coefficientLeaf2, 520);
assert.equal(metrics.coefficientLeaf3, 1120);
assert.equal(metrics.coefficientLeaf4, 1440);
assert.equal(metrics.grossCoefficient, 3080);
assert.ok(Math.abs(metrics.meanRawFer - 1.02) < 1e-12);
assert.ok(Math.abs(metrics.fer10d - 1.1333333333333333) < 1e-12);
assert.ok(Math.abs(metrics.finalFer - 1.1516666666666666) < 1e-12);
assert.ok(Math.abs(metrics.sed - 3547.133333333333) < 1e-9);
const resetMetrics = calculateSigatokaMetrics(plants.map(plant => ({ ...plant, previousLeafReading: 29, currentLeafReading: 7 })), 7, 1.17, 0.8);
assert.equal(resetMetrics.meanRawFer, 0.8);
assert.ok(resetMetrics.sed > 0);
const resetValidation = validateSigatokaPlants(plants.map(plant => ({ ...plant, previousLeafReading: 29, currentLeafReading: 7 })), [], 0.8);
assert.equal(resetValidation.some(issue => issue.severity === 'error'), false);
assert.equal(resetValidation.every(issue => issue.severity === 'warning'), true);
assert.ok(Math.abs(convertArea(1, 10000, 4046.8564224) - 2.471053814671653) < 1e-12);

const weekly = aggregateSigatokaSessions([
  { id: 'a', sectorName: 'S1', plotName: 'P1', plotArea: 1, plotAreaSquareMetres: 10000, areaUnit: 'ha', observedAt: '2019-11-01', monitoringWeek: 45, monitoringYear: 2019, observerId: 'u1', observerName: 'Scout', intervalDays: 9, status: 'submitted', plants, metrics, rainfallMm: 20, treatment: null },
  { id: 'b', sectorName: 'S1', plotName: 'P2', plotArea: 1, plotAreaSquareMetres: 10000, areaUnit: 'ha', observedAt: '2019-11-02', monitoringWeek: 45, monitoringYear: 2019, observerId: 'u1', observerName: 'Scout', intervalDays: 9, status: 'verified', plants, metrics: { ...metrics, sed: 3000 }, rainfallMm: 30, treatment: { appliedAt: '2019-11-02', product: 'Example' } },
]);
assert.equal(weekly.length, 1);
assert.equal(weekly[0].plots, 2);
assert.equal(weekly[0].sedMin, 3000);
assert.equal(weekly[0].sedMax, metrics.sed);
assert.equal(weekly[0].rainfallMm, 25);
assert.equal(weekly[0].treatments.length, 1);

const alerts = generateSigatokaDecisionAlerts([
  { ...weekly[0], id: 'older', plotName: 'P1', observedAt: '2026-01-01', status: 'submitted', plants, metrics: { ...metrics, sed: 1000, averageYil: 4, highDensityCount: 2 } },
  { ...weekly[0], id: 'newer', plotName: 'P1', observedAt: '2026-01-08', status: 'submitted', plants, rainfallMm: 60, metrics: { ...metrics, sed: 1500, averageYil: 2.5, highDensityCount: 7 } },
], { watch: 1200, high: 2000, critical: 3000 }, 7, new Date('2026-01-09T12:00:00'));
assert.ok(alerts.some(alert => alert.title === 'Disease pressure is worsening' && alert.severity === 'critical'));
assert.ok(alerts.some(alert => alert.title === 'High rainfall pressure'));
assert.ok(alerts.some(alert => alert.title === 'SED needs attention'));

const detailedStageObservation = {
  plantNumber: 1,
  leafCounts: createEmptySigatokaAdvancedStageLeafCounts().map(row => row.leafNumber === 8
    ? { ...row, stage4Count: 26, stage5Count: 2, stage6Count: 0 }
    : row.leafNumber <= 10 ? { ...row, stage4Count: 0, stage5Count: 0, stage6Count: 0 } : row),
};
assert.deepEqual(detailedStageObservation.leafCounts.map(row => row.leafNumber), [5, 6, 7, 8, 9, 10, 11, 12, 13]);
assert.deepEqual(validateSigatokaAdvancedStageObservation(detailedStageObservation, plants), []);
assert.deepEqual(summarizeSigatokaAdvancedStageObservation(detailedStageObservation, plants), {
  assessedLeaves: 6,
  unassessedLeaves: 3,
  stage4Total: 26,
  stage5Total: 2,
  stage6Total: 0,
  totalSymptoms: 28,
});
const normalizedDetailed = normalizeSigatokaAdvancedStageObservation({
  plantNumber: 1,
  leafCounts: [
    { leafNumber: 8, stage4Count: 26, stage5Count: 2, stage6Count: 0 },
    { leafNumber: 8, stage4Count: 99, stage5Count: 99, stage6Count: 99 },
    { leafNumber: 14, stage4Count: 3, stage5Count: 0, stage6Count: 0 },
  ],
}, plants);
assert.equal(normalizedDetailed?.leafCounts.length, 9);
assert.deepEqual(normalizedDetailed?.leafCounts.find(row => row.leafNumber === 8), { leafNumber: 8, stage4Count: 26, stage5Count: 2, stage6Count: 0 });
assert.equal(normalizedDetailed?.leafCounts.find(row => row.leafNumber === 14), undefined);
assert.ok(validateSigatokaAdvancedStageObservation({ ...detailedStageObservation, plantNumber: 99 }, plants).some(issue => issue.includes('sampled plant')));
assert.ok(validateSigatokaAdvancedStageObservation({ ...detailedStageObservation, leafCounts: detailedStageObservation.leafCounts.slice(0, 8) }, plants).some(issue => issue.includes('every leaf')));
assert.ok(validateSigatokaAdvancedStageObservation({ ...detailedStageObservation, leafCounts: detailedStageObservation.leafCounts.map(row => ({ ...row, stage4Count: null, stage5Count: null, stage6Count: null })) }, plants).some(issue => issue.includes('at least one')));
assert.ok(validateSigatokaAdvancedStageObservation({ ...detailedStageObservation, leafCounts: detailedStageObservation.leafCounts.map(row => row.leafNumber === 8 ? { ...row, stage5Count: null } : row) }, plants).some(issue => issue.includes('all three stage counts')));

const weeklyWithDetailedStages = aggregateSigatokaSessions([
  { id: 'detailed', sectorName: 'S1', plotName: 'P1', plotArea: 1, plotAreaSquareMetres: 10000, areaUnit: 'ha', observedAt: '2026-02-05', monitoringWeek: 6, monitoringYear: 2026, observerId: 'u1', observerName: 'Scout', intervalDays: 7, status: 'submitted', plants, advancedStageObservation: detailedStageObservation, metrics, rainfallMm: null, treatment: null },
]);
assert.equal(weeklyWithDetailedStages[0].advancedStages.observations, 1);
assert.equal(weeklyWithDetailedStages[0].advancedStages.assessedLeaves, 6);
assert.equal(weeklyWithDetailedStages[0].advancedStages.totalSymptoms, 28);

console.log('Sigatoka SED parity, detailed stage observation, aggregation, and decision alert checks passed.');
