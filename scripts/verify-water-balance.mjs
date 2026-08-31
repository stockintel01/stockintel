import assert from 'node:assert/strict';
import { calculateWaterBalance, createWaterImportTemplateCsv, parseWaterImport, projectNextIrrigation } from '../lib/agric/water-balance.ts';

const base = {
  sectorName: 'North', plotName: 'P1', cropName: 'Banana', cropCoefficient: 1.1,
  effectiveRainfallPercent: 80, irrigationEfficiencyPercent: 80, triggerDeficitMm: 8,
  source: 'manual', createdBy: 'u1', createdByName: 'Tester',
};
const rows = calculateWaterBalance([
  { ...base, id: '1', date: '2026-01-01', rainfallMm: 10, et0Mm: 5, irrigationMm: 0 },
  { ...base, id: '2', date: '2026-01-02', rainfallMm: 0, et0Mm: 5, irrigationMm: 0 },
  { ...base, id: '3', date: '2026-01-03', rainfallMm: 0, et0Mm: 5, irrigationMm: 2 },
]);

assert.equal(rows[0].cropDemandMm, 5.5);
assert.equal(rows[0].effectiveRainfallMm, 8);
assert.equal(rows[0].runningDeficitMm, 0);
assert.equal(rows[1].runningDeficitMm, 5.5);
assert.equal(rows[2].runningDeficitMm, 9);
assert.equal(rows[2].irrigationDue, true);
assert.equal(rows[2].recommendedGrossIrrigationMm, 11.25);

const projection = projectNextIrrigation({ ...rows[1], triggerDeficitMm: 10 }, [
  { date: '2026-01-03', rainfallMm: 0, et0Mm: 3 },
  { date: '2026-01-04', rainfallMm: 0, et0Mm: 3 },
]);
assert.equal(projection.dueDate, '2026-01-04');
assert.equal(projection.daysUntilDue, 1);
assert.equal(projection.projectedDeficitMm, 12.1);

const imported = await parseWaterImport(new File([createWaterImportTemplateCsv()], 'water.csv', { type: 'text/csv' }));
assert.equal(imported.errors.length, 0);
assert.equal(imported.records.length, 1);
assert.equal(imported.records[0].rainfallMm, 12.5);
assert.equal(imported.records[0].cropCoefficient, 1.1);

console.log('Water balance carry-forward, irrigation trigger, forecast, and import checks passed.');
