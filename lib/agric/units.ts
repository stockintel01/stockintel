import type { UOM } from './types';

type UnitFamily = 'volume' | 'weight' | 'count';

const UNIT_FACTORS: Record<UOM, { family: UnitFamily; factor: number; label: string }> = {
  ml: { family: 'volume', factor: 1, label: 'ml' },
  lt: { family: 'volume', factor: 1000, label: 'L' },
  L: { family: 'volume', factor: 1000, label: 'L' },
  g: { family: 'weight', factor: 1, label: 'g' },
  kg: { family: 'weight', factor: 1000, label: 'kg' },
  units: { family: 'count', factor: 1, label: 'units' },
  bags: { family: 'count', factor: 1, label: 'bags' },
  boxes: { family: 'count', factor: 1, label: 'boxes' },
};

export const UOM_OPTIONS: UOM[] = ['ml', 'lt', 'L', 'g', 'kg', 'units', 'bags', 'boxes'];

export function getUnitFamily(uom: UOM): UnitFamily {
  return UNIT_FACTORS[uom]?.family ?? 'count';
}

export function canConvertUnit(from: UOM, to: UOM): boolean {
  return getUnitFamily(from) === getUnitFamily(to);
}

export function compatibleUnits(uom: UOM): UOM[] {
  const family = getUnitFamily(uom);
  return UOM_OPTIONS.filter(option => getUnitFamily(option) === family);
}

export function convertQuantity(quantity: number, from: UOM, to: UOM): number {
  if (!Number.isFinite(quantity)) return 0;
  if (from === to) return quantity;
  if (!canConvertUnit(from, to)) return quantity;
  const baseQuantity = quantity * UNIT_FACTORS[from].factor;
  return baseQuantity / UNIT_FACTORS[to].factor;
}

export function formatQuantity(quantity: number, uom: UOM): string {
  const rounded = Math.round((quantity + Number.EPSILON) * 1000) / 1000;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toString()} ${UNIT_FACTORS[uom]?.label ?? uom}`;
}

export function calculateRestockByDate(shortfallDate?: string, leadDays = 7): string | undefined {
  if (!shortfallDate) return undefined;
  const date = new Date(shortfallDate);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setDate(date.getDate() - leadDays);
  return date.toISOString().slice(0, 10);
}
