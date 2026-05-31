// ============================================================
// STOCKINTEL AGRI — Extended Types
// Covers: Crop Farming, Livestock (Cattle, Sheep, Goat, Pig),
//         Poultry (Layers, Broilers, Turkeys, Ducks, Geese)
// Global standard: aligns with FAO livestock production coding
// ============================================================

// ── Farm Operation Type ──────────────────────────────────────
export type FarmOperationType = 'crop' | 'livestock' | 'poultry' | 'mixed';

// ── Livestock Species ────────────────────────────────────────
export type LivestockSpecies =
  | 'cattle' | 'sheep' | 'goat' | 'pig' | 'rabbit'
  | 'horse' | 'donkey' | 'camel' | 'deer';

// ── Poultry Species ──────────────────────────────────────────
export type PoultrySpecies =
  | 'chicken_layer' | 'chicken_broiler' | 'chicken_cockerel'
  | 'turkey' | 'duck' | 'goose' | 'guinea_fowl' | 'quail' | 'ostrich';

// ── Production Purpose ────────────────────────────────────────
export type ProductionPurpose =
  | 'egg_production' | 'meat_production' | 'dairy' | 'breeding'
  | 'dual_purpose' | 'wool' | 'draft';

// ── Animal Health Status ─────────────────────────────────────
export type AnimalHealthStatus = 'healthy' | 'sick' | 'quarantine' | 'treatment' | 'recovery' | 'deceased';

// ── Mortality Reason ─────────────────────────────────────────
export type MortalityReason =
  | 'disease' | 'predator' | 'injury' | 'heat_stress' | 'cold_stress'
  | 'nutritional_deficiency' | 'unknown' | 'culled' | 'sold';

// ── Flock / Herd ─────────────────────────────────────────────
export interface AnimalFlockHerd {
  id: string;
  name: string;                          // e.g. "Pen A - Layer Batch 12"
  species: LivestockSpecies | PoultrySpecies;
  breed?: string;                        // e.g. "Isa Brown", "Friesian", "Boer"
  purpose: ProductionPurpose;
  penHouseId: string;
  penHouseName: string;
  farmZone?: string;

  // Population tracking
  currentCount: number;
  initialCount: number;
  femaleCount?: number;
  maleCount?: number;

  // Age / batch
  dateOfBirth?: string;                 // ISO date (or batch placement date)
  ageWeeks?: number;                    // auto-calculated
  ageDays?: number;

  // For layers: production phase
  productionPhase?: 'chick' | 'grower' | 'pre_lay' | 'peak_lay' | 'late_lay' | 'spent';
  expectedLayStart?: string;           // ISO date
  expectedLayEnd?: string;

  // For broilers
  targetSlaughterWeight?: number;       // kg
  targetSlaughterAge?: number;          // days
  expectedSlaughterDate?: string;

  // For livestock
  averageWeight?: number;               // kg
  targetWeight?: number;               // kg

  // Feed plan
  feedPlanId?: string;

  status: 'active' | 'completed' | 'sold' | 'culled';
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

// ── Daily Egg Production Record (Layers) ────────────────────
export interface EggProductionRecord {
  id: string;
  flockId: string;
  flockName: string;
  date: string;                         // YYYY-MM-DD
  shift: 'morning' | 'afternoon' | 'all_day';
  penHouseId: string;
  penHouseName: string;

  // Egg counts by grade
  totalEggsCollected: number;
  gradeA: number;                       // Premium — whole, clean, uncracked
  gradeB: number;                       // Table eggs — minor blemishes
  gradeC: number;                       // Cracked / processing grade
  dirtyEggs: number;                    // Rejected — soiled
  softShellEggs: number;               // Calcium deficiency indicator

  // Lay rate (auto-calculated)
  layRate?: number;                     // percentage
  activeLayers?: number;               // count used for rate calc

  // Packaging
  traysCollected?: number;             // 1 tray = 30 eggs
  cratesCollected?: number;            // 1 crate = 360 eggs (12 trays)

  collectedBy: string;
  supervisorId?: string;
  notes?: string;
}

// ── Egg Inventory / Stock ────────────────────────────────────
export interface EggInventory {
  id: string;
  date: string;
  openingStock: { gradeA: number; gradeB: number; gradeC: number; total: number };
  collected: { gradeA: number; gradeB: number; gradeC: number; total: number };
  sold: { gradeA: number; gradeB: number; gradeC: number; total: number };
  broken: number;
  closingStock: { gradeA: number; gradeB: number; gradeC: number; total: number };
}

// ── Egg Sale / Dispatch ──────────────────────────────────────
export interface EggSaleRecord {
  id: string;
  date: string;
  buyerName: string;
  buyerContact?: string;
  gradeA: number;
  gradeB: number;
  gradeC: number;
  totalEggs: number;
  trays: number;
  pricePerTray?: number;                // e.g. GHS 35
  currency?: string;
  totalRevenue?: number;
  paymentStatus: 'cash' | 'credit' | 'mobile_money' | 'bank_transfer';
  invoiceNumber?: string;
  soldBy: string;
  notes?: string;
}

// ── Mortality Record ─────────────────────────────────────────
export interface MortalityRecord {
  id: string;
  flockId: string;
  flockName: string;
  species: LivestockSpecies | PoultrySpecies;
  date: string;
  count: number;                        // number of animals that died
  reason: MortalityReason;
  symptoms?: string;
  disposalMethod?: 'buried' | 'incinerated' | 'composted' | 'biogas' | 'other';
  vetVisitRequired: boolean;
  vetVisitDate?: string;
  treatmentGiven?: string;
  recordedBy: string;
  notes?: string;
}

// ── Livestock/Poultry Feed Item ──────────────────────────────
export type LivestockFeedCategory =
  | 'layer_mash' | 'layer_pellet' | 'broiler_starter' | 'broiler_finisher'
  | 'grower_mash' | 'chick_mash' | 'scratch_grain' | 'concentrate'
  | 'cattle_feed' | 'dairy_meal' | 'pig_starter' | 'pig_grower' | 'pig_finisher'
  | 'goat_sheep_pellet' | 'mineral_supplement' | 'vitamin_supplement'
  | 'salt_lick' | 'silage' | 'hay' | 'roughage' | 'custom_mix';

// ── Feed Consumption Log ─────────────────────────────────────
export interface FeedConsumptionLog {
  id: string;
  flockHerdId: string;
  flockHerdName: string;
  species: LivestockSpecies | PoultrySpecies;
  date: string;
  feedItemId: string;
  feedItemName: string;
  feedCategory: LivestockFeedCategory;
  quantityKg: number;
  feedsPerDay: number;                 // 1, 2, 3
  animalCount: number;                 // for FCR calculation
  feedConversionRatio?: number;        // kg feed / kg gain (broilers/pigs)
  costPerKg?: number;
  totalCost?: number;
  recordedBy: string;
  notes?: string;
}

// ── Feed Plan ────────────────────────────────────────────────
export interface LivestockFeedPlan {
  id: string;
  name: string;
  flockHerdId: string;
  flockHerdName: string;
  species: LivestockSpecies | PoultrySpecies;
  phase: string;                        // e.g. "Starter 0-4 weeks"
  startDate: string;
  endDate: string;
  feedItemId: string;
  feedItemName: string;
  feedCategory: LivestockFeedCategory;
  dailyRationKgPerAnimal: number;
  totalAnimalCount: number;
  totalDailyKg: number;               // auto: dailyRation * count
  durationDays: number;
  totalFeedRequired: number;           // kg for full plan
  currentStockAtPlanTime: number;
  isStockSufficient: boolean;
  projectedShortfallDate?: string;
  status: 'draft' | 'active' | 'completed';
  createdBy: string;
  createdAt: string;
}

// ── Vaccination / Treatment Record ──────────────────────────
export interface VaccinationRecord {
  id: string;
  flockHerdId: string;
  flockHerdName: string;
  species: LivestockSpecies | PoultrySpecies;
  date: string;
  vaccineOrDrug: string;               // e.g. "Newcastle Disease Vaccine"
  batchNumber?: string;
  manufacturer?: string;
  disease?: string;                    // target disease
  routeOfAdmin: 'drinking_water' | 'injection' | 'spray' | 'eye_drop' | 'oral' | 'topical';
  dosage: string;                      // e.g. "1ml per bird"
  animalCount: number;
  nextDueDate?: string;
  withdrawalPeriodDays?: number;       // meat/egg withdrawal (important for food safety)
  administeredBy: string;
  vetApproval?: string;
  cost?: number;
  notes?: string;
}

// ── Weight Record (growth tracking) ─────────────────────────
export interface WeightRecord {
  id: string;
  flockHerdId: string;
  flockHerdName: string;
  date: string;
  sampleSize: number;                  // number of animals weighed
  avgWeightKg: number;
  minWeightKg?: number;
  maxWeightKg?: number;
  targetWeightKg?: number;
  fcr?: number;                        // feed conversion ratio
  recordedBy: string;
  notes?: string;
}

// ── Pen / House ──────────────────────────────────────────────
export interface PenHouse {
  id: string;
  name: string;                        // e.g. "Poultry House A", "Cattle Barn 1"
  type: 'poultry_house' | 'cattle_barn' | 'pig_sty' | 'sheep_goat_pen' | 'quarantine' | 'other';
  capacity: number;                    // max animals
  currentOccupancy: number;
  species?: LivestockSpecies | PoultrySpecies;
  ventilationType?: 'open_sided' | 'closed_controlled' | 'semi_closed';
  flooringType?: 'litter' | 'concrete' | 'slatted' | 'deep_litter';
  farmZone?: string;
  notes?: string;
}

// ── Livestock Sale / Slaughter ───────────────────────────────
export interface LivestockSaleRecord {
  id: string;
  flockHerdId: string;
  flockHerdName: string;
  species: LivestockSpecies | PoultrySpecies;
  date: string;
  type: 'live_sale' | 'slaughter_sale' | 'breeding_sale' | 'culling';
  count: number;
  avgLiveWeightKg?: number;
  avgCarcassWeightKg?: number;
  dressingPercentage?: number;          // carcass/live weight %
  pricePerKg?: number;
  pricePerHead?: number;
  totalRevenue?: number;
  currency?: string;
  buyerName?: string;
  buyerContact?: string;
  transportCost?: number;
  invoiceNumber?: string;
  soldBy: string;
  notes?: string;
}

// ── Milk Production (Dairy) ───────────────────────────────────
export interface MilkProductionRecord {
  id: string;
  herdId: string;
  herdName: string;
  date: string;
  shift: 'morning' | 'evening' | 'midday';
  activeMilkingCows: number;
  totalLitres: number;
  avgPerCow?: number;
  fatContent?: number;                  // %
  rejected?: number;                   // litres (mastitis, contamination)
  sold?: number;
  stored?: number;
  pricePerLitre?: number;
  revenue?: number;
  recordedBy: string;
  notes?: string;
}

// ── Daily Farm KPI Dashboard ─────────────────────────────────
export interface LivestockDailyKPI {
  date: string;
  totalFlocks: number;
  totalAnimals: number;
  mortalityToday: number;
  mortalityRate: number;              // %
  eggsCollectedToday?: number;
  layRateToday?: number;             // %
  feedConsumedKgToday?: number;
  milkLitresToday?: number;
  revenueToday?: number;
  alerts: string[];
}
