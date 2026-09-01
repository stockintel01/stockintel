import type { PackingFulfilmentPlan, PackingRecord, ShippingRecord } from './types';

export type PackingOccurrenceStatus = 'pending' | 'in_progress' | 'ready_to_ship' | 'overdue' | 'completed';

export interface PackingFulfilmentOccurrence {
  key: string;
  plan: PackingFulfilmentPlan;
  occurrenceDate: string;
  acceptedPackedBoxes: number;
  rejectedBoxes: number;
  shippedBoxes: number;
  remainingToPack: number;
  remainingToShip: number;
  status: PackingOccurrenceStatus;
}

export interface PackingDailyMetrics {
  acceptedPackedBoxes: number;
  rejectedBoxes: number;
  targetBoxes: number;
  shippedBoxes: number;
  efficiencyPercent: number | null;
}

interface PackingPlanOperationalFields {
  stationId: string;
  farmZone: string;
  produce: string;
  targetBoxes: number;
  startDate: string;
  recurrence: PackingFulfilmentPlan['recurrence'];
  endDate?: string;
  shipmentRequired: boolean;
}

export function packingPlanOperationalFieldsChanged(current: PackingPlanOperationalFields, next: PackingPlanOperationalFields): boolean {
  return current.stationId !== next.stationId
    || current.farmZone !== next.farmZone
    || current.produce !== next.produce
    || current.targetBoxes !== next.targetBoxes
    || current.startDate !== next.startDate
    || current.recurrence !== next.recurrence
    || (current.endDate || '') !== (next.endDate || '')
    || current.shipmentRequired !== next.shipmentRequired;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function packingCalendarDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDate(value: string): Date {
  if (!DATE_PATTERN.test(value)) throw new Error(`Invalid packing schedule date: ${value}`);
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid packing schedule date: ${value}`);
  return date;
}

export function packingDateOffset(value: string, days: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthlyDate(value: string, monthOffset: number): string {
  const date = parseDate(value);
  const desiredDay = date.getUTCDate();
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset, 1, 12));
  const year = target.getUTCFullYear();
  const month = target.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0, 12)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(desiredDay, lastDay), 12)).toISOString().slice(0, 10);
}

export function packingPlanOccurrenceDates(plan: PackingFulfilmentPlan, fromDate: string, toDate: string): string[] {
  if (plan.status !== 'active' || plan.startDate > toDate || (plan.endDate && plan.endDate < fromDate)) return [];
  const dates: string[] = [];
  let cursor = plan.startDate;
  let guard = 0;
  while (cursor <= toDate && guard < 1000) {
    if (cursor >= fromDate && (!plan.endDate || cursor <= plan.endDate)) dates.push(cursor);
    if (plan.recurrence === 'none') break;
    cursor = plan.recurrence === 'monthly'
      ? monthlyDate(plan.startDate, guard + 1)
      : packingDateOffset(cursor, plan.recurrence === 'biweekly' ? 14 : 7);
    guard++;
  }
  return dates;
}

export function buildPackingFulfilmentOccurrences(
  plans: PackingFulfilmentPlan[],
  packingRecords: PackingRecord[],
  shippingRecords: ShippingRecord[],
  fromDate: string,
  toDate: string,
  today: string,
): PackingFulfilmentOccurrence[] {
  return plans.flatMap(plan => packingPlanOccurrenceDates(plan, fromDate, toDate).map(occurrenceDate => {
    const linkedPacking = packingRecords.filter(record => record.fulfilmentPlanId === plan.id && record.fulfilmentOccurrenceDate === occurrenceDate);
    const linkedShipping = shippingRecords.filter(record => record.fulfilmentPlanId === plan.id && record.fulfilmentOccurrenceDate === occurrenceDate);
    const acceptedPackedBoxes = linkedPacking.reduce((total, record) => total + Math.max(0, record.packedBoxes - record.rejectedBoxes), 0);
    const rejectedBoxes = linkedPacking.reduce((total, record) => total + Math.max(0, record.rejectedBoxes), 0);
    const shippedBoxes = linkedShipping.reduce((total, record) => total + Math.max(0, record.boxesShipped), 0);
    const remainingToPack = Math.max(0, plan.targetBoxes - acceptedPackedBoxes);
    const remainingToShip = plan.shipmentRequired ? Math.max(0, plan.targetBoxes - shippedBoxes) : 0;
    const complete = remainingToPack === 0 && (!plan.shipmentRequired || remainingToShip === 0);
    const status: PackingOccurrenceStatus = complete
      ? 'completed'
      : plan.shipmentRequired && remainingToPack === 0
        ? 'ready_to_ship'
        : acceptedPackedBoxes > 0 || shippedBoxes > 0
          ? 'in_progress'
          : occurrenceDate < today ? 'overdue' : 'pending';
    return {
      key: `${plan.id}|${occurrenceDate}`,
      plan,
      occurrenceDate,
      acceptedPackedBoxes,
      rejectedBoxes,
      shippedBoxes,
      remainingToPack,
      remainingToShip,
      status,
    };
  })).sort((left, right) => left.occurrenceDate.localeCompare(right.occurrenceDate) || left.plan.activityName.localeCompare(right.plan.activityName));
}

export function calculatePackingDailyMetrics(
  date: string,
  occurrences: PackingFulfilmentOccurrence[],
  packingRecords: PackingRecord[],
  shippingRecords: ShippingRecord[],
): PackingDailyMetrics {
  const dailyPacking = packingRecords.filter(record => record.date === date);
  const acceptedPackedBoxes = dailyPacking.reduce((total, record) => total + Math.max(0, record.packedBoxes - record.rejectedBoxes), 0);
  const rejectedBoxes = dailyPacking.reduce((total, record) => total + Math.max(0, record.rejectedBoxes), 0);
  const plannedTarget = occurrences.filter(occurrence => occurrence.occurrenceDate === date).reduce((total, occurrence) => total + occurrence.plan.targetBoxes, 0);
  const manualTarget = dailyPacking.filter(record => !record.fulfilmentPlanId).reduce((total, record) => total + Math.max(0, record.targetBoxes), 0);
  const targetBoxes = plannedTarget + manualTarget;
  const shippedBoxes = shippingRecords.filter(record => record.dispatchDate === date).reduce((total, record) => total + Math.max(0, record.boxesShipped), 0);
  return {
    acceptedPackedBoxes,
    rejectedBoxes,
    targetBoxes,
    shippedBoxes,
    efficiencyPercent: targetBoxes > 0 ? Math.round(acceptedPackedBoxes / targetBoxes * 100) : null,
  };
}
