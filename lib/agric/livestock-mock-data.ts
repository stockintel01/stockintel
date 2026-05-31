// ============================================================
// LIVESTOCK & POULTRY MOCK DATA
// Realistic numbers based on global production standards:
// - Layer hens: 250-300 eggs/year, 75-95% lay rate
// - Broilers: 6-8 weeks to slaughter, ~2.5kg live weight
// - Dairy cows: 15-25L/day
// - Feed FCR: Broilers 1.6-1.8, Pigs 2.5-3.5
// ============================================================

import type {
  AnimalFlockHerd, EggProductionRecord, EggSaleRecord,
  MortalityRecord, FeedConsumptionLog, VaccinationRecord,
  WeightRecord, PenHouse, LivestockSaleRecord, MilkProductionRecord,
  LivestockFeedPlan,
} from './livestock-types';
import type { AgricInventoryItem } from './types';

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const daysAhead = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

// ── Pen / Houses ─────────────────────────────────────────────
export const MOCK_PENS: PenHouse[] = [
  { id: 'ph01', name: 'Layer House A', type: 'poultry_house', capacity: 3000, currentOccupancy: 2800, species: 'chicken_layer', ventilationType: 'open_sided', flooringType: 'litter', farmZone: 'Poultry Block' },
  { id: 'ph02', name: 'Layer House B', type: 'poultry_house', capacity: 3000, currentOccupancy: 2650, species: 'chicken_layer', ventilationType: 'open_sided', flooringType: 'litter', farmZone: 'Poultry Block' },
  { id: 'ph03', name: 'Broiler House', type: 'poultry_house', capacity: 5000, currentOccupancy: 4800, species: 'chicken_broiler', ventilationType: 'closed_controlled', flooringType: 'deep_litter', farmZone: 'Poultry Block' },
  { id: 'ph04', name: 'Chick House (Day-Olds)', type: 'poultry_house', capacity: 2000, currentOccupancy: 1500, species: 'chicken_broiler', ventilationType: 'closed_controlled', flooringType: 'litter', farmZone: 'Poultry Block' },
  { id: 'ph05', name: 'Cattle Barn', type: 'cattle_barn', capacity: 60, currentOccupancy: 45, species: 'cattle', farmZone: 'Livestock Block' },
  { id: 'ph06', name: 'Pig Sty A', type: 'pig_sty', capacity: 80, currentOccupancy: 64, species: 'pig', farmZone: 'Livestock Block' },
  { id: 'ph07', name: 'Sheep & Goat Pen', type: 'sheep_goat_pen', capacity: 120, currentOccupancy: 88, farmZone: 'Livestock Block' },
  { id: 'ph08', name: 'Quarantine House', type: 'quarantine', capacity: 100, currentOccupancy: 12, farmZone: 'Poultry Block' },
];

// ── Flocks & Herds ────────────────────────────────────────────
export const MOCK_FLOCKS: AnimalFlockHerd[] = [
  // Layer flocks
  {
    id: 'fl01', name: 'Layer House A — Batch 7 (Isa Brown)',
    species: 'chicken_layer', breed: 'Isa Brown', purpose: 'egg_production',
    penHouseId: 'ph01', penHouseName: 'Layer House A',
    currentCount: 2800, initialCount: 3000, femaleCount: 2800, maleCount: 0,
    dateOfBirth: daysAgo(280), ageWeeks: 40,
    productionPhase: 'peak_lay',
    expectedLayStart: daysAgo(120), expectedLayEnd: daysAhead(240),
    status: 'active', createdBy: 'Farm Manager', createdAt: daysAgo(280),
    notes: 'Peak production. Daily lay rate: 88–92%',
  },
  {
    id: 'fl02', name: 'Layer House B — Batch 8 (Lohmann Brown)',
    species: 'chicken_layer', breed: 'Lohmann Brown', purpose: 'egg_production',
    penHouseId: 'ph02', penHouseName: 'Layer House B',
    currentCount: 2650, initialCount: 2800, femaleCount: 2650, maleCount: 0,
    dateOfBirth: daysAgo(200), ageWeeks: 28,
    productionPhase: 'pre_lay',
    expectedLayStart: daysAhead(14), expectedLayEnd: daysAhead(360),
    status: 'active', createdBy: 'Farm Manager', createdAt: daysAgo(200),
    notes: 'Coming into lay. Transition to layer mash initiated.',
  },
  // Broiler flock
  {
    id: 'fl03', name: 'Broiler House — Batch 22 (Cobb 500)',
    species: 'chicken_broiler', breed: 'Cobb 500', purpose: 'meat_production',
    penHouseId: 'ph03', penHouseName: 'Broiler House',
    currentCount: 4800, initialCount: 5000, maleCount: 2450, femaleCount: 2350,
    dateOfBirth: daysAgo(28), ageWeeks: 4,
    targetSlaughterWeight: 2.5, targetSlaughterAge: 42,
    expectedSlaughterDate: daysAhead(14),
    averageWeight: 1.28,
    status: 'active', createdBy: 'Farm Manager', createdAt: daysAgo(28),
    notes: 'Day 28. On schedule. Current avg weight 1.28kg. Target 2.5kg at day 42.',
  },
  // Day-old chicks (DOC)
  {
    id: 'fl04', name: 'Chick House — Broiler Batch 23 (DOC)',
    species: 'chicken_broiler', breed: 'Ross 308', purpose: 'meat_production',
    penHouseId: 'ph04', penHouseName: 'Chick House (Day-Olds)',
    currentCount: 1500, initialCount: 1500,
    dateOfBirth: daysAgo(7), ageWeeks: 1,
    targetSlaughterWeight: 2.5, targetSlaughterAge: 42,
    expectedSlaughterDate: daysAhead(35),
    status: 'active', createdBy: 'Farm Manager', createdAt: daysAgo(7),
  },
  // Cattle (dairy)
  {
    id: 'fl05', name: 'Dairy Herd — Friesian Crossbred',
    species: 'cattle', breed: 'Friesian × Holstein', purpose: 'dairy',
    penHouseId: 'ph05', penHouseName: 'Cattle Barn',
    currentCount: 45, initialCount: 45, femaleCount: 38, maleCount: 7,
    averageWeight: 480, targetWeight: 550,
    status: 'active', createdBy: 'Farm Manager', createdAt: daysAgo(365),
    notes: '38 milking cows, 7 bulls/steers. Avg daily milk yield: 18L/cow.',
  },
  // Pigs
  {
    id: 'fl06', name: 'Pig Sty A — Grower-Finisher',
    species: 'pig', breed: 'Large White × Landrace', purpose: 'meat_production',
    penHouseId: 'ph06', penHouseName: 'Pig Sty A',
    currentCount: 64, initialCount: 70, maleCount: 30, femaleCount: 34,
    dateOfBirth: daysAgo(90), ageWeeks: 13,
    averageWeight: 58, targetWeight: 100,
    expectedSlaughterDate: daysAhead(45),
    status: 'active', createdBy: 'Farm Manager', createdAt: daysAgo(90),
    notes: 'Currently on grower ration. Target market weight 100kg.',
  },
  // Sheep & Goats
  {
    id: 'fl07', name: 'Sheep & Goat Pen — Mixed',
    species: 'sheep', breed: 'Dorper × West African Dwarf', purpose: 'meat_production',
    penHouseId: 'ph07', penHouseName: 'Sheep & Goat Pen',
    currentCount: 88, initialCount: 90, femaleCount: 60, maleCount: 28,
    averageWeight: 28, targetWeight: 40,
    status: 'active', createdBy: 'Farm Manager', createdAt: daysAgo(120),
  },
];

// ── Egg Production Records (last 7 days, Layer House A) ──────
export const MOCK_EGG_RECORDS: EggProductionRecord[] = [
  { id: 'ep01', flockId: 'fl01', flockName: 'Layer House A — Batch 7', date: today(), shift: 'morning', penHouseId: 'ph01', penHouseName: 'Layer House A', totalEggsCollected: 2508, gradeA: 2300, gradeB: 148, gradeC: 40, dirtyEggs: 14, softShellEggs: 6, layRate: 89.6, activeLayers: 2800, traysCollected: 83, cratesCollected: 6, collectedBy: 'Kofi Mensah', supervisorId: 's01' },
  { id: 'ep02', flockId: 'fl01', flockName: 'Layer House A — Batch 7', date: daysAgo(1), shift: 'morning', penHouseId: 'ph01', penHouseName: 'Layer House A', totalEggsCollected: 2492, gradeA: 2280, gradeB: 156, gradeC: 36, dirtyEggs: 12, softShellEggs: 8, layRate: 89.0, activeLayers: 2800, traysCollected: 83, cratesCollected: 6, collectedBy: 'Kofi Mensah' },
  { id: 'ep03', flockId: 'fl01', flockName: 'Layer House A — Batch 7', date: daysAgo(2), shift: 'morning', penHouseId: 'ph01', penHouseName: 'Layer House A', totalEggsCollected: 2520, gradeA: 2310, gradeB: 150, gradeC: 42, dirtyEggs: 10, softShellEggs: 8, layRate: 90.0, activeLayers: 2800, traysCollected: 84, cratesCollected: 7, collectedBy: 'Ama Owusu' },
  { id: 'ep04', flockId: 'fl01', flockName: 'Layer House A — Batch 7', date: daysAgo(3), shift: 'morning', penHouseId: 'ph01', penHouseName: 'Layer House A', totalEggsCollected: 2464, gradeA: 2254, gradeB: 160, gradeC: 32, dirtyEggs: 10, softShellEggs: 8, layRate: 88.0, activeLayers: 2800, traysCollected: 82, cratesCollected: 6, collectedBy: 'Kofi Mensah' },
  { id: 'ep05', flockId: 'fl01', flockName: 'Layer House A — Batch 7', date: daysAgo(4), shift: 'morning', penHouseId: 'ph01', penHouseName: 'Layer House A', totalEggsCollected: 2534, gradeA: 2320, gradeB: 158, gradeC: 38, dirtyEggs: 12, softShellEggs: 6, layRate: 90.5, activeLayers: 2800, traysCollected: 84, cratesCollected: 7, collectedBy: 'Ama Owusu' },
  { id: 'ep06', flockId: 'fl01', flockName: 'Layer House A — Batch 7', date: daysAgo(5), shift: 'morning', penHouseId: 'ph01', penHouseName: 'Layer House A', totalEggsCollected: 2477, gradeA: 2264, gradeB: 163, gradeC: 30, dirtyEggs: 14, softShellEggs: 6, layRate: 88.5, activeLayers: 2800, traysCollected: 82, cratesCollected: 6, collectedBy: 'Kofi Mensah' },
  { id: 'ep07', flockId: 'fl01', flockName: 'Layer House A — Batch 7', date: daysAgo(6), shift: 'morning', penHouseId: 'ph01', penHouseName: 'Layer House A', totalEggsCollected: 2495, gradeA: 2285, gradeB: 158, gradeC: 34, dirtyEggs: 12, softShellEggs: 6, layRate: 89.1, activeLayers: 2800, traysCollected: 83, cratesCollected: 6, collectedBy: 'Ama Owusu' },
];

// ── Egg Sales ─────────────────────────────────────────────────
export const MOCK_EGG_SALES: EggSaleRecord[] = [
  { id: 'es01', date: today(), buyerName: 'Accra Egg Distributors Ltd', buyerContact: '+233 20 111 2233', gradeA: 1800, gradeB: 0, gradeC: 0, totalEggs: 1800, trays: 60, pricePerTray: 38, currency: 'GHS', totalRevenue: 2280, paymentStatus: 'mobile_money', invoiceNumber: 'INV-EGG-2441', soldBy: 'Farm Manager' },
  { id: 'es02', date: daysAgo(1), buyerName: 'Kumasi Retail Market', buyerContact: '+233 24 555 6677', gradeA: 900, gradeB: 120, gradeC: 0, totalEggs: 1020, trays: 34, pricePerTray: 35, currency: 'GHS', totalRevenue: 1190, paymentStatus: 'cash', soldBy: 'Farm Manager' },
  { id: 'es03', date: daysAgo(2), buyerName: 'FreshMart Supermarket', buyerContact: '+233 30 233 4455', gradeA: 2100, gradeB: 0, gradeC: 0, totalEggs: 2100, trays: 70, pricePerTray: 40, currency: 'GHS', totalRevenue: 2800, paymentStatus: 'bank_transfer', invoiceNumber: 'INV-EGG-2440', soldBy: 'Farm Manager' },
];

// ── Mortality Records ────────────────────────────────────────
export const MOCK_MORTALITY: MortalityRecord[] = [
  { id: 'mr01', flockId: 'fl01', flockName: 'Layer House A — Batch 7', species: 'chicken_layer', date: today(), count: 4, reason: 'disease', symptoms: 'Reduced appetite, ruffled feathers, 2 found with bloody droppings', disposalMethod: 'incinerated', vetVisitRequired: true, vetVisitDate: daysAhead(1), recordedBy: 'Kofi Mensah', notes: 'Possible coccidiosis. Isolation of 12 birds initiated.' },
  { id: 'mr02', flockId: 'fl03', flockName: 'Broiler House — Batch 22', species: 'chicken_broiler', date: daysAgo(1), count: 8, reason: 'heat_stress', symptoms: 'Panting, wing spreading, prostrate birds found in afternoon', disposalMethod: 'buried', vetVisitRequired: false, recordedBy: 'Emmanuel Atta', notes: 'Temperature peaked at 36°C. Fans increased and cool water provided.' },
  { id: 'mr03', flockId: 'fl06', flockName: 'Pig Sty A — Grower-Finisher', species: 'pig', date: daysAgo(3), count: 2, reason: 'unknown', symptoms: 'Found dead overnight. No prior symptoms observed.', disposalMethod: 'composted', vetVisitRequired: true, recordedBy: 'Farm Manager', notes: 'Vet visit scheduled.' },
];

// ── Feed Inventory (Livestock-specific items) ─────────────────
export const MOCK_LIVESTOCK_FEED_INVENTORY: AgricInventoryItem[] = [
  { id: 'lf01', name: 'Layer Mash (18% Protein)', chemicalComponent: '', category: 'other', uom: 'kg', packSize: '50kg bag', currentStock: 8500, minimumStock: 2000, reorderAlertDays: 7, unitCost: 1.4, location: 'Feed Store A', lastUpdated: today(), createdBy: 'system', isActive: true, avgWeeklyUsage: 3500 },
  { id: 'lf02', name: 'Broiler Starter Crumbles (22% Protein)', chemicalComponent: '', category: 'other', uom: 'kg', packSize: '50kg bag', currentStock: 4200, minimumStock: 1000, reorderAlertDays: 5, unitCost: 1.65, location: 'Feed Store A', lastUpdated: today(), createdBy: 'system', isActive: true, avgWeeklyUsage: 2800 },
  { id: 'lf03', name: 'Broiler Finisher Pellets (19% Protein)', chemicalComponent: '', category: 'other', uom: 'kg', packSize: '50kg bag', currentStock: 6800, minimumStock: 1500, reorderAlertDays: 7, unitCost: 1.55, location: 'Feed Store A', lastUpdated: today(), createdBy: 'system', isActive: true, avgWeeklyUsage: 4200 },
  { id: 'lf04', name: 'Chick Mash (20% Protein)', chemicalComponent: '', category: 'other', uom: 'kg', packSize: '25kg bag', currentStock: 1200, minimumStock: 500, reorderAlertDays: 5, unitCost: 1.8, location: 'Feed Store A', lastUpdated: today(), createdBy: 'system', isActive: true, avgWeeklyUsage: 600 },
  { id: 'lf05', name: 'Cattle Dairy Meal (16% Protein)', chemicalComponent: '', category: 'other', uom: 'kg', packSize: '50kg bag', currentStock: 3200, minimumStock: 800, reorderAlertDays: 7, unitCost: 1.1, location: 'Feed Store B', lastUpdated: today(), createdBy: 'system', isActive: true, avgWeeklyUsage: 1200 },
  { id: 'lf06', name: 'Pig Grower Meal (16% Protein)', chemicalComponent: '', category: 'other', uom: 'kg', packSize: '50kg bag', currentStock: 2400, minimumStock: 600, reorderAlertDays: 7, unitCost: 1.25, location: 'Feed Store B', lastUpdated: today(), createdBy: 'system', isActive: true, avgWeeklyUsage: 900 },
  { id: 'lf07', name: 'Limestone (Calcium Supplement)', chemicalComponent: 'CaCO3', category: 'other', uom: 'kg', packSize: '25kg bag', currentStock: 450, minimumStock: 100, reorderAlertDays: 7, unitCost: 0.4, location: 'Feed Store A', lastUpdated: today(), createdBy: 'system', isActive: true, avgWeeklyUsage: 80 },
  { id: 'lf08', name: 'Vitamin & Mineral Premix (Poultry)', chemicalComponent: '', category: 'other', uom: 'kg', packSize: '5kg tub', currentStock: 38, minimumStock: 10, reorderAlertDays: 7, unitCost: 18, location: 'Feed Store A', lastUpdated: today(), createdBy: 'system', isActive: true, avgWeeklyUsage: 8 },
  { id: 'lf09', name: 'Salt Lick Blocks (Cattle)', chemicalComponent: 'NaCl + Trace minerals', category: 'other', uom: 'kg', packSize: '5kg block', currentStock: 60, minimumStock: 20, reorderAlertDays: 14, unitCost: 2.2, location: 'Feed Store B', lastUpdated: today(), createdBy: 'system', isActive: true, avgWeeklyUsage: 10 },
  { id: 'lf10', name: 'Hay / Dry Forage', chemicalComponent: '', category: 'other', uom: 'kg', packSize: 'bale', currentStock: 1800, minimumStock: 400, reorderAlertDays: 14, unitCost: 0.3, location: 'Hay Store', lastUpdated: today(), createdBy: 'system', isActive: true, avgWeeklyUsage: 500 },
  // Veterinary supplies
  { id: 'vs01', name: 'Newcastle Disease Vaccine (LaSota)', chemicalComponent: '', category: 'other', uom: 'units', packSize: '100 dose vial', currentStock: 15, minimumStock: 5, reorderAlertDays: 14, unitCost: 8, location: 'Cold Room (Vaccines)', lastUpdated: today(), createdBy: 'system', isActive: true },
  { id: 'vs02', name: 'Gumboro Vaccine (IBD)', chemicalComponent: '', category: 'other', uom: 'units', packSize: '100 dose vial', currentStock: 12, minimumStock: 4, reorderAlertDays: 14, unitCost: 10, location: 'Cold Room (Vaccines)', lastUpdated: today(), createdBy: 'system', isActive: true },
  { id: 'vs03', name: 'Amprolium (Coccidiostat)', chemicalComponent: 'Amprolium 20%', category: 'other', uom: 'g', packSize: '1kg', currentStock: 800, minimumStock: 200, reorderAlertDays: 7, unitCost: 0.06, location: 'Vet Supplies', lastUpdated: today(), createdBy: 'system', isActive: true, avgWeeklyUsage: 150 },
  { id: 'vs04', name: 'Oxytetracycline Powder', chemicalComponent: 'Oxytetracycline HCl 20%', category: 'other', uom: 'g', packSize: '500g', currentStock: 1200, minimumStock: 300, reorderAlertDays: 7, unitCost: 0.04, location: 'Vet Supplies', lastUpdated: today(), createdBy: 'system', isActive: true },
  { id: 'vs05', name: 'Ivermectin Injectable (1%)', chemicalComponent: 'Ivermectin 10mg/ml', category: 'other', uom: 'ml', packSize: '50ml vial', currentStock: 600, minimumStock: 150, reorderAlertDays: 14, unitCost: 0.12, location: 'Vet Supplies', lastUpdated: today(), createdBy: 'system', isActive: true },
];

// ── Feed Consumption Logs (today) ────────────────────────────
export const MOCK_FEED_LOGS: FeedConsumptionLog[] = [
  { id: 'fc01', flockHerdId: 'fl01', flockHerdName: 'Layer House A — Batch 7', species: 'chicken_layer', date: today(), feedItemId: 'lf01', feedItemName: 'Layer Mash (18% Protein)', feedCategory: 'layer_mash', quantityKg: 560, feedsPerDay: 2, animalCount: 2800, costPerKg: 1.4, totalCost: 784, recordedBy: 'Kofi Mensah', notes: '100g/bird/day standard ration' },
  { id: 'fc02', flockHerdId: 'fl03', flockHerdName: 'Broiler House — Batch 22', species: 'chicken_broiler', date: today(), feedItemId: 'lf03', feedItemName: 'Broiler Finisher Pellets', feedCategory: 'broiler_finisher', quantityKg: 864, feedsPerDay: 3, animalCount: 4800, feedConversionRatio: 1.82, costPerKg: 1.55, totalCost: 1339.2, recordedBy: 'Emmanuel Atta', notes: '180g/bird/day. FCR tracking.' },
  { id: 'fc03', flockHerdId: 'fl04', flockHerdName: 'Chick House — Broiler Batch 23', species: 'chicken_broiler', date: today(), feedItemId: 'lf04', feedItemName: 'Chick Mash', feedCategory: 'chick_mash', quantityKg: 90, feedsPerDay: 3, animalCount: 1500, costPerKg: 1.8, totalCost: 162, recordedBy: 'Emmanuel Atta', notes: '60g/bird/day starter' },
  { id: 'fc04', flockHerdId: 'fl05', flockHerdName: 'Dairy Herd', species: 'cattle', date: today(), feedItemId: 'lf05', feedItemName: 'Cattle Dairy Meal', feedCategory: 'dairy_meal', quantityKg: 304, feedsPerDay: 2, animalCount: 38, costPerKg: 1.1, totalCost: 334.4, recordedBy: 'Farm Manager', notes: '8kg dairy meal + ad lib hay per cow' },
  { id: 'fc05', flockHerdId: 'fl06', flockHerdName: 'Pig Sty A — Grower-Finisher', species: 'pig', date: today(), feedItemId: 'lf06', feedItemName: 'Pig Grower Meal', feedCategory: 'pig_grower', quantityKg: 192, feedsPerDay: 2, animalCount: 64, feedConversionRatio: 2.8, costPerKg: 1.25, totalCost: 240, recordedBy: 'Farm Manager', notes: '3kg/pig/day. FCR 2.8 on track.' },
];

// ── Vaccination Records ───────────────────────────────────────
export const MOCK_VACCINATIONS: VaccinationRecord[] = [
  { id: 'vx01', flockHerdId: 'fl01', flockHerdName: 'Layer House A — Batch 7', species: 'chicken_layer', date: daysAgo(14), vaccineOrDrug: 'Newcastle Disease Vaccine (LaSota)', batchNumber: 'ND-2026-441', manufacturer: 'MSD Animal Health', disease: 'Newcastle Disease', routeOfAdmin: 'drinking_water', dosage: '1 dose per bird in 10L water', animalCount: 2800, nextDueDate: daysAhead(28), withdrawalPeriodDays: 0, administeredBy: 'Dr. Kwame Asante (DVM)', cost: 224 },
  { id: 'vx02', flockHerdId: 'fl03', flockHerdName: 'Broiler House — Batch 22', species: 'chicken_broiler', date: daysAgo(21), vaccineOrDrug: 'Gumboro Vaccine (IBD)', batchNumber: 'IBD-2026-118', manufacturer: 'Ceva Animal Health', disease: 'Infectious Bursal Disease', routeOfAdmin: 'drinking_water', dosage: '1 dose per bird', animalCount: 5000, nextDueDate: daysAhead(7), withdrawalPeriodDays: 0, administeredBy: 'Dr. Kwame Asante (DVM)', cost: 500 },
  { id: 'vx03', flockHerdId: 'fl05', flockHerdName: 'Dairy Herd', species: 'cattle', date: daysAgo(30), vaccineOrDrug: 'FMD Vaccine (O1 + SAT1)', batchNumber: 'FMD-2026-77', manufacturer: 'Botswana Vaccine Institute', disease: 'Foot and Mouth Disease', routeOfAdmin: 'injection', dosage: '2ml subcutaneous', animalCount: 45, nextDueDate: daysAhead(150), withdrawalPeriodDays: 21, administeredBy: 'Dr. Abena Frimpong (DVM)', cost: 360 },
];

// ── Weight / Growth Records ───────────────────────────────────
export const MOCK_WEIGHT_RECORDS: WeightRecord[] = [
  { id: 'wr01', flockHerdId: 'fl03', flockHerdName: 'Broiler House — Batch 22', date: today(), sampleSize: 50, avgWeightKg: 1.28, minWeightKg: 1.05, maxWeightKg: 1.52, targetWeightKg: 1.30, fcr: 1.82, recordedBy: 'Emmanuel Atta', notes: 'Day 28. Slightly below target. Review feeding regime.' },
  { id: 'wr02', flockHerdId: 'fl03', flockHerdName: 'Broiler House — Batch 22', date: daysAgo(7), sampleSize: 50, avgWeightKg: 0.88, targetWeightKg: 0.90, fcr: 1.75, recordedBy: 'Emmanuel Atta', notes: 'Day 21.' },
  { id: 'wr03', flockHerdId: 'fl06', flockHerdName: 'Pig Sty A — Grower-Finisher', date: today(), sampleSize: 15, avgWeightKg: 58.2, targetWeightKg: 60.0, fcr: 2.8, recordedBy: 'Farm Manager', notes: 'Week 13. On track for market weight at week 22.' },
];

// ── Livestock Sales ───────────────────────────────────────────
export const MOCK_LIVESTOCK_SALES: LivestockSaleRecord[] = [
  { id: 'ls01', flockHerdId: 'fl03', flockHerdName: 'Broiler House — Batch 21', species: 'chicken_broiler', date: daysAgo(30), type: 'slaughter_sale', count: 4800, avgLiveWeightKg: 2.48, avgCarcassWeightKg: 1.79, dressingPercentage: 72.2, pricePerKg: 14.50, totalRevenue: 124488, currency: 'GHS', buyerName: 'Chicken Republic Processing', transportCost: 1200, invoiceNumber: 'INV-LS-2411', soldBy: 'Farm Manager' },
  { id: 'ls02', flockHerdId: 'fl07', flockHerdName: 'Sheep & Goat Pen', species: 'sheep', date: daysAgo(7), type: 'live_sale', count: 12, avgLiveWeightKg: 32, pricePerHead: 350, totalRevenue: 4200, currency: 'GHS', buyerName: 'Local Market — Kumasi', soldBy: 'Farm Manager' },
];

// ── Milk Production Records ───────────────────────────────────
export const MOCK_MILK_RECORDS: MilkProductionRecord[] = [
  { id: 'mp01', herdId: 'fl05', herdName: 'Dairy Herd', date: today(), shift: 'morning', activeMilkingCows: 38, totalLitres: 380, avgPerCow: 10.0, fatContent: 3.8, rejected: 0, sold: 280, stored: 100, pricePerLitre: 4.5, revenue: 1260, recordedBy: 'Farm Manager' },
  { id: 'mp02', herdId: 'fl05', herdName: 'Dairy Herd', date: today(), shift: 'evening', activeMilkingCows: 38, totalLitres: 304, avgPerCow: 8.0, fatContent: 4.1, rejected: 8, sold: 200, stored: 96, pricePerLitre: 4.5, revenue: 900, recordedBy: 'Farm Manager', notes: '8L rejected — 2 cows showing mastitis signs. Vet notification sent.' },
  { id: 'mp03', herdId: 'fl05', herdName: 'Dairy Herd', date: daysAgo(1), shift: 'morning', activeMilkingCows: 38, totalLitres: 392, avgPerCow: 10.3, fatContent: 3.9, rejected: 0, sold: 290, stored: 102, pricePerLitre: 4.5, revenue: 1305, recordedBy: 'Farm Manager' },
];

// ── Feed Plans ────────────────────────────────────────────────
export const MOCK_LIVESTOCK_FEED_PLANS: LivestockFeedPlan[] = [
  {
    id: 'fp01', name: 'Broiler Finisher Plan — Batch 22 (Week 4-6)',
    flockHerdId: 'fl03', flockHerdName: 'Broiler House — Batch 22',
    species: 'chicken_broiler', phase: 'Finisher (Day 28–42)',
    startDate: today(), endDate: daysAhead(14),
    feedItemId: 'lf03', feedItemName: 'Broiler Finisher Pellets',
    feedCategory: 'broiler_finisher',
    dailyRationKgPerAnimal: 0.18, totalAnimalCount: 4800,
    totalDailyKg: 864, durationDays: 14,
    totalFeedRequired: 12096,
    currentStockAtPlanTime: 6800,
    isStockSufficient: false,
    projectedShortfallDate: daysAhead(7),
    status: 'active', createdBy: 'Farm Manager', createdAt: today(),
  },
  {
    id: 'fp02', name: 'Layer House A — Weekly Feed Plan',
    flockHerdId: 'fl01', flockHerdName: 'Layer House A — Batch 7',
    species: 'chicken_layer', phase: 'Peak Lay',
    startDate: today(), endDate: daysAhead(7),
    feedItemId: 'lf01', feedItemName: 'Layer Mash (18% Protein)',
    feedCategory: 'layer_mash',
    dailyRationKgPerAnimal: 0.1, totalAnimalCount: 2800,
    totalDailyKg: 280, durationDays: 7,
    totalFeedRequired: 1960,
    currentStockAtPlanTime: 8500,
    isStockSufficient: true,
    status: 'active', createdBy: 'Farm Manager', createdAt: today(),
  },
];

// ── 7-Day Egg Production Trend (for charts) ──────────────────
export const EGG_PRODUCTION_TREND = [
  { day: daysAgo(6), layRate: 89.1, eggs: 2495, gradeA: 2285 },
  { day: daysAgo(5), layRate: 88.5, eggs: 2477, gradeA: 2264 },
  { day: daysAgo(4), layRate: 90.5, eggs: 2534, gradeA: 2320 },
  { day: daysAgo(3), layRate: 88.0, eggs: 2464, gradeA: 2254 },
  { day: daysAgo(2), layRate: 90.0, eggs: 2520, gradeA: 2310 },
  { day: daysAgo(1), layRate: 89.0, eggs: 2492, gradeA: 2280 },
  { day: today(),    layRate: 89.6, eggs: 2508, gradeA: 2300 },
];
