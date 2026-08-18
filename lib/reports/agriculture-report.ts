export type ReportCategory = 'fungicide' | 'insecticide' | 'herbicide' | 'fertilizer';

export interface StockMovementRow {
  id: string;
  itemName: string;
  category: ReportCategory;
  baseUom: 'L' | 'kg';
  packLabel: string;
  conversionNote: string;
  opening: number;
  received: number;
  usageByZone: Record<string, number>;
  damaged: number;
  closing: number;
  minimumStock: number;
  unitCost: number;
}

export interface WeeklyOperationsReport {
  year: number;
  week: number;
  startDate: string;
  endDate: string;
  rows: StockMovementRow[];
}

export const DEMO_ZONES = ['Banana Block', 'Okra Block', 'Tomato Block', 'Mixed Crop Block'] as const;

const PRODUCTS = [
  { id: 'fung-copper', itemName: 'Copper Fungicide', category: 'fungicide', baseUom: 'kg', packLabel: '20 x 500 g', conversionNote: '1 pack = 10 kg', minimumStock: 28, unitCost: 92 },
  { id: 'fung-systemic', itemName: 'Systemic Fungicide', category: 'fungicide', baseUom: 'L', packLabel: '12 x 1 L', conversionNote: '1 carton = 12 L', minimumStock: 18, unitCost: 164 },
  { id: 'ins-bio', itemName: 'Bio Insecticide', category: 'insecticide', baseUom: 'L', packLabel: '24 x 250 ml', conversionNote: '1 carton = 6 L', minimumStock: 12, unitCost: 208 },
  { id: 'ins-contact', itemName: 'Contact Insecticide', category: 'insecticide', baseUom: 'L', packLabel: '12 x 500 ml', conversionNote: '1 carton = 6 L', minimumStock: 14, unitCost: 176 },
  { id: 'herb-selective', itemName: 'Selective Herbicide', category: 'herbicide', baseUom: 'L', packLabel: '4 x 5 L', conversionNote: '1 carton = 20 L', minimumStock: 24, unitCost: 71 },
  { id: 'herb-contact', itemName: 'Contact Herbicide', category: 'herbicide', baseUom: 'L', packLabel: '12 x 1 L', conversionNote: '1 carton = 12 L', minimumStock: 16, unitCost: 83 },
  { id: 'fert-npk', itemName: 'NPK 15-15-15', category: 'fertilizer', baseUom: 'kg', packLabel: '50 kg bag', conversionNote: '1 bag = 50 kg', minimumStock: 450, unitCost: 8.8 },
  { id: 'fert-foliar', itemName: 'Foliar Feed', category: 'fertilizer', baseUom: 'L', packLabel: '4 x 5 L', conversionNote: '1 carton = 20 L', minimumStock: 30, unitCost: 58 },
] as const satisfies ReadonlyArray<Omit<StockMovementRow, 'opening' | 'received' | 'usageByZone' | 'damaged' | 'closing'>>;

const INITIAL_STOCK = [64, 42, 31, 29, 78, 35, 1250, 92];

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function createDemoReports(): WeeklyOperationsReport[] {
  const previousClosing = [...INITIAL_STOCK];

  return Array.from({ length: 6 }, (_, weekIndex) => {
    const week = 35 + weekIndex;
    const start = new Date(Date.UTC(2026, 7, 23 + weekIndex * 7));
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);

    const rows = PRODUCTS.map((product, productIndex): StockMovementRow => {
      const opening = previousClosing[productIndex];
      const received = (weekIndex + productIndex) % 4 === 1
        ? (product.baseUom === 'kg' ? (productIndex === 6 ? 500 : 40) : 24)
        : 0;
      const scale = product.baseUom === 'kg' ? (productIndex === 6 ? 9 : 1.5) : 0.55;
      const proposedUsage = Object.fromEntries(DEMO_ZONES.map((zone, zoneIndex) => [
        zone,
        round((((weekIndex + 2) * (productIndex + 3) * (zoneIndex + 2)) % 9 + 1) * scale),
      ]));
      const proposedTotal = Object.values(proposedUsage).reduce((sum, value) => sum + value, 0);
      const available = opening + received;
      const issueFactor = proposedTotal > available * 0.88 ? (available * 0.88) / proposedTotal : 1;
      const usageByZone = Object.fromEntries(
        Object.entries(proposedUsage).map(([zone, value]) => [zone, round(value * issueFactor)]),
      );
      const totalUsage = Object.values(usageByZone).reduce((sum, value) => sum + value, 0);
      const damaged = (weekIndex === 3 && productIndex === 2 && available - totalUsage >= 0.5) ? 0.5 : 0;
      const closing = round(opening + received - totalUsage - damaged);
      previousClosing[productIndex] = closing;

      return { ...product, opening, received, usageByZone, damaged, closing };
    });

    return { year: 2026, week, startDate: isoDate(start), endDate: isoDate(end), rows };
  });
}

export const DEMO_REPORTS = createDemoReports();

export function totalUsage(row: StockMovementRow): number {
  return round(Object.values(row.usageByZone).reduce((sum, value) => sum + value, 0));
}

export function reconciliationVariance(row: StockMovementRow): number {
  return round(row.opening + row.received - totalUsage(row) - row.damaged - row.closing);
}
