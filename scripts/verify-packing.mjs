import assert from 'node:assert/strict';
import { buildPackingFulfilmentOccurrences, calculatePackingDailyMetrics, packingPlanOccurrenceDates } from '../lib/agric/packing.ts';

const plan = {
  id: 'plan-1', activityName: 'Weekly customer order', customerName: 'Customer A', destinationName: 'Depot',
  stationId: 'station-1', stationName: 'Line 1', farmZone: 'North', produce: 'Banana', targetBoxes: 100,
  startDate: '2026-01-31', recurrence: 'monthly', shipmentRequired: true, status: 'active', createdBy: 'manager-1',
};

assert.deepEqual(packingPlanOccurrenceDates(plan, '2026-01-01', '2026-04-30'), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);

const weekly = { ...plan, recurrence: 'weekly', startDate: '2026-02-01', endDate: '2026-02-20' };
assert.deepEqual(packingPlanOccurrenceDates(weekly, '2026-02-01', '2026-02-28'), ['2026-02-01', '2026-02-08', '2026-02-15']);

const packing = [
  { id: 'pack-1', date: '2026-02-01', stationId: 'station-1', stationName: 'Line 1', supervisorId: 's1', supervisorName: 'Supervisor', farmZone: 'North', produce: 'Banana', targetBoxes: 100, packedBoxes: 70, rejectedBoxes: 5, shift: 'morning', workers: [], fulfilmentPlanId: 'plan-1', fulfilmentOccurrenceDate: '2026-01-31' },
  { id: 'pack-2', date: '2026-02-01', stationId: 'station-1', stationName: 'Line 1', supervisorId: 's1', supervisorName: 'Supervisor', farmZone: 'North', produce: 'Banana', targetBoxes: 0, packedBoxes: 35, rejectedBoxes: 0, shift: 'afternoon', workers: [], fulfilmentPlanId: 'plan-1', fulfilmentOccurrenceDate: '2026-01-31' },
];
const shipping = [
  { id: 'ship-1', dispatchDate: '2026-02-01', destinationName: 'Depot', supervisorId: 's1', stationId: 'station-1', produce: 'Banana', boxesShipped: 60, fulfilmentPlanId: 'plan-1', fulfilmentOccurrenceDate: '2026-01-31' },
];
const occurrences = buildPackingFulfilmentOccurrences([plan], packing, shipping, '2026-01-01', '2026-02-28', '2026-02-01');
assert.equal(occurrences[0].acceptedPackedBoxes, 100);
assert.equal(occurrences[0].remainingToPack, 0);
assert.equal(occurrences[0].remainingToShip, 40);
assert.equal(occurrences[0].status, 'ready_to_ship');

const todayPlan = { ...plan, id: 'today', startDate: '2026-02-01', recurrence: 'none' };
const todayOccurrences = buildPackingFulfilmentOccurrences([todayPlan], packing, shipping, '2026-02-01', '2026-02-01', '2026-02-01');
const metrics = calculatePackingDailyMetrics('2026-02-01', todayOccurrences, packing, shipping);
assert.equal(metrics.acceptedPackedBoxes, 100);
assert.equal(metrics.rejectedBoxes, 5);
assert.equal(metrics.targetBoxes, 100);
assert.equal(metrics.shippedBoxes, 60);
assert.equal(metrics.efficiencyPercent, 100);

console.log('Packing recurrence, fulfilment rollup, and daily KPI checks passed.');
