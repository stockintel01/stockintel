// ============================================================
// MOCK DATA - Derived directly from Moonlight Fresco Excel files
// Week 10 Stock Report + Usage Reports
// ============================================================
import {
  AgricInventoryItem, UsageLog, StockRequest, EquipmentCheckout,
  SprayPlan, PackingRecord, ShippingRecord, AgricAlert, WeeklyStockReport
} from './types';

export const FARM_ZONES = ['Banana', 'Okra', 'Papaya', 'Tomato', 'Beans', 'Bitter Gourd', 'Moringa', 'Passion Fruit'] as const;

// ── Inventory (from Week 10 report + usage files) ────────────
export const MOCK_AGRIC_INVENTORY: AgricInventoryItem[] = [
  // FUNGICIDES
  { id: 'f01', name: 'Ivory 80WP', chemicalComponent: 'Mancozeb', category: 'fungicide', uom: 'kg', packSize: '1kg', currentStock: 16.5, minimumStock: 5, reorderAlertDays: 7, unitCost: 45, location: 'Rack A1', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 2.5 },
  { id: 'f02', name: 'Banko D', chemicalComponent: 'Chlorothalonil 400g/l Difenoconazole 50g/l', category: 'fungicide', uom: 'lt', packSize: '500ml', currentStock: 8.5, minimumStock: 3, reorderAlertDays: 5, unitCost: 85, location: 'Rack A2', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 1.8 },
  { id: 'f03', name: 'Sulfa 80WP', chemicalComponent: 'Sulfur 80%', category: 'fungicide', uom: 'kg', packSize: '1kg', currentStock: 19, minimumStock: 5, reorderAlertDays: 7, unitCost: 30, location: 'Rack A3', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 3 },
  { id: 'f04', name: 'NORDOX 75G', chemicalComponent: 'Copper', category: 'fungicide', uom: 'kg', packSize: '75g', currentStock: 58.5, minimumStock: 10, reorderAlertDays: 14, unitCost: 22, location: 'Rack A4', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 5 },
  { id: 'f05', name: 'Kyventiq 130 SC', chemicalComponent: 'Inatreq active (fenpicoxamid) 130g/l', category: 'fungicide', uom: 'lt', packSize: '60l', currentStock: 0.8, minimumStock: 2, reorderAlertDays: 10, unitCost: 380, location: 'Rack A5', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 0.5 },
  { id: 'f06', name: 'Paraffin Oil', chemicalComponent: '', category: 'fungicide', uom: 'lt', packSize: '200L', currentStock: 426, minimumStock: 50, reorderAlertDays: 14, unitCost: 4.5, location: 'Tank B1', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 40 },
  { id: 'f07', name: 'Serenade ASO SC', chemicalComponent: 'Bacillus subtilis strain QST 713', category: 'fungicide', uom: 'lt', packSize: '1L', currentStock: 34, minimumStock: 8, reorderAlertDays: 10, unitCost: 95, location: 'Rack A6', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 6 },
  { id: 'f08', name: 'Kasu-B Plus', chemicalComponent: '5% Kasugamycin + 45% Copper Oxychloride', category: 'fungicide', uom: 'kg', packSize: '1kg', currentStock: 16, minimumStock: 4, reorderAlertDays: 7, unitCost: 65, location: 'Rack A7', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 2 },
  { id: 'f09', name: 'Prozole', chemicalComponent: '250g/L Propiconazole', category: 'fungicide', uom: 'lt', packSize: '5L', currentStock: 97.5, minimumStock: 20, reorderAlertDays: 14, unitCost: 55, location: 'Rack A8', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 8 },
  { id: 'f10', name: 'Nativo', chemicalComponent: 'Tebuconazole', category: 'fungicide', uom: 'lt', packSize: '250ml', currentStock: 1.75, minimumStock: 1, reorderAlertDays: 5, unitCost: 120, location: 'Rack A9', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 0.5 },
  // INSECTICIDES
  { id: 'i01', name: 'Spartan 300 OD', chemicalComponent: 'Imidacloprid 210g/l and Beta-cyfluthrin 90g/l', category: 'insecticide', uom: 'lt', packSize: '100ml', currentStock: 13.7, minimumStock: 5, reorderAlertDays: 7, unitCost: 95, location: 'Rack B1', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 2 },
  { id: 'i02', name: 'Vytal 3G', chemicalComponent: 'Oxamyl', category: 'insecticide', uom: 'kg', packSize: '1kg', currentStock: 10.15, minimumStock: 3, reorderAlertDays: 7, unitCost: 110, location: 'Rack B2', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 1.5 },
  { id: 'i03', name: 'Decis Insecticide', chemicalComponent: 'Deltamethrin 100g/l', category: 'insecticide', uom: 'lt', packSize: '100ml', currentStock: 22.7, minimumStock: 8, reorderAlertDays: 10, unitCost: 75, location: 'Rack B3', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 3 },
  { id: 'i04', name: 'Reeva', chemicalComponent: 'Cyhalothrin 2.5% W/V EC', category: 'insecticide', uom: 'lt', packSize: '1L', currentStock: 31.2, minimumStock: 10, reorderAlertDays: 10, unitCost: 58, location: 'Rack B4', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 4 },
  { id: 'i05', name: 'Thunder', chemicalComponent: 'Imidacloprid 100g/l Betacyfluthrin 45g/l', category: 'insecticide', uom: 'lt', packSize: '100ml', currentStock: 21, minimumStock: 8, reorderAlertDays: 10, unitCost: 82, location: 'Rack B5', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 3 },
  { id: 'i06', name: 'Trivor 310 DC', chemicalComponent: 'Pyriproxyfen and Acetamiprid', category: 'insecticide', uom: 'lt', packSize: '100ml', currentStock: 16.4, minimumStock: 5, reorderAlertDays: 7, unitCost: 88, location: 'Rack B6', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 2.5 },
  { id: 'i07', name: 'Sefina', chemicalComponent: 'Afidopyropen 50g/l DC', category: 'insecticide', uom: 'lt', packSize: '', currentStock: 37.2, minimumStock: 10, reorderAlertDays: 10, unitCost: 145, location: 'Rack B7', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 5 },
  { id: 'i08', name: 'Punto', chemicalComponent: '', category: 'insecticide', uom: 'kg', packSize: '1kg', currentStock: 91, minimumStock: 20, reorderAlertDays: 14, unitCost: 18, location: 'Rack B8', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 8 },
  { id: 'i09', name: 'Pyrical 480 EC', chemicalComponent: 'Chlorpyrifos-ethyl 50g', category: 'insecticide', uom: 'kg', packSize: '1kg', currentStock: 19.93, minimumStock: 5, reorderAlertDays: 7, unitCost: 42, location: 'Rack B9', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 2 },
  { id: 'i10', name: 'Flower DS 4EC', chemicalComponent: '', category: 'insecticide', uom: 'lt', packSize: '250ml', currentStock: 27, minimumStock: 8, reorderAlertDays: 7, unitCost: 60, location: 'Rack B10', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 3.5 },
  // HERBICIDES
  { id: 'h01', name: 'Kalach 360', chemicalComponent: 'Glyphosate 360g/l', category: 'herbicide', uom: 'lt', packSize: '1L', currentStock: 45, minimumStock: 10, reorderAlertDays: 10, unitCost: 28, location: 'Rack C1', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 7 },
  { id: 'h02', name: 'Landlord', chemicalComponent: 'Glyphosate', category: 'herbicide', uom: 'lt', packSize: '1L', currentStock: 18, minimumStock: 5, reorderAlertDays: 7, unitCost: 32, location: 'Rack C2', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 3 },
  { id: 'h03', name: 'Kalach Extra', chemicalComponent: '', category: 'herbicide', uom: 'lt', packSize: '1L', currentStock: 12, minimumStock: 4, reorderAlertDays: 7, unitCost: 35, location: 'Rack C3', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 2 },
  { id: 'h04', name: 'Agil Herbicide 100EC', chemicalComponent: '', category: 'herbicide', uom: 'lt', packSize: '250ml', currentStock: 6, minimumStock: 2, reorderAlertDays: 5, unitCost: 75, location: 'Rack C4', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 1 },
  // FERTILIZERS
  { id: 'fe01', name: 'MAP', chemicalComponent: 'Monoammonium Phosphate', category: 'fertilizer', uom: 'kg', packSize: '25kg bags', currentStock: 850, minimumStock: 200, reorderAlertDays: 14, unitCost: 1.2, location: 'Warehouse D', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 120 },
  { id: 'fe02', name: 'Urea', chemicalComponent: 'Urea 46%', category: 'fertilizer', uom: 'kg', packSize: '25kg bags', currentStock: 1200, minimumStock: 300, reorderAlertDays: 14, unitCost: 0.85, location: 'Warehouse D', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 180 },
  { id: 'fe03', name: 'GMOP', chemicalComponent: 'Granular MOP', category: 'fertilizer', uom: 'kg', packSize: '25kg bags', currentStock: 400, minimumStock: 100, reorderAlertDays: 14, unitCost: 1.4, location: 'Warehouse D', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 60 },
  { id: 'fe04', name: 'Potassium Nitrate', chemicalComponent: 'KNO3', category: 'fertilizer', uom: 'kg', packSize: '25kg bags', currentStock: 620, minimumStock: 150, reorderAlertDays: 14, unitCost: 1.6, location: 'Warehouse D', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 90 },
  { id: 'fe05', name: 'Calcinate', chemicalComponent: 'Calcium Nitrate', category: 'fertilizer', uom: 'kg', packSize: '25kg bags', currentStock: 75, minimumStock: 100, reorderAlertDays: 21, unitCost: 1.1, location: 'Warehouse D', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 40 },
  { id: 'fe06', name: 'Naturaim L', chemicalComponent: 'Liquid Amino Acid', category: 'fertilizer', uom: 'lt', packSize: '1L', currentStock: 22, minimumStock: 5, reorderAlertDays: 7, unitCost: 38, location: 'Rack D1', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 3 },
  // EQUIPMENT
  { id: 'eq01', name: 'Cutlass', chemicalComponent: '', category: 'equipment', uom: 'units', packSize: '', currentStock: 25, minimumStock: 10, reorderAlertDays: 30, unitCost: 15, location: 'Equipment Room', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true },
  { id: 'eq02', name: 'Knapsack Sprayer', chemicalComponent: '', category: 'equipment', uom: 'units', packSize: '', currentStock: 12, minimumStock: 5, reorderAlertDays: 30, unitCost: 85, location: 'Equipment Room', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true },
  { id: 'eq03', name: 'Watering Can', chemicalComponent: '', category: 'equipment', uom: 'units', packSize: '', currentStock: 18, minimumStock: 8, reorderAlertDays: 30, unitCost: 12, location: 'Equipment Room', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true },
  { id: 'eq04', name: 'Safety Boots (pair)', chemicalComponent: '', category: 'equipment', uom: 'units', packSize: '', currentStock: 20, minimumStock: 10, reorderAlertDays: 30, unitCost: 35, location: 'Equipment Room', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true },
  { id: 'eq05', name: 'Chemical Gloves (pair)', chemicalComponent: '', category: 'equipment', uom: 'units', packSize: '', currentStock: 8, minimumStock: 15, reorderAlertDays: 14, unitCost: 8, location: 'Equipment Room', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true },
  { id: 'eq06', name: 'Hoe', chemicalComponent: '', category: 'equipment', uom: 'units', packSize: '', currentStock: 30, minimumStock: 12, reorderAlertDays: 30, unitCost: 18, location: 'Equipment Room', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true },
  // SEEDS
  { id: 's01', name: 'Okra Seeds', chemicalComponent: '', category: 'seed', uom: 'g', packSize: '100g', currentStock: 2400, minimumStock: 500, reorderAlertDays: 14, unitCost: 0.05, location: 'Cold Room', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 300 },
  { id: 's02', name: 'Tomato Seeds', chemicalComponent: '', category: 'seed', uom: 'g', packSize: '100g', currentStock: 800, minimumStock: 200, reorderAlertDays: 14, unitCost: 0.12, location: 'Cold Room', lastUpdated: '2026-02-07', createdBy: 'system', isActive: true, avgWeeklyUsage: 100 },
];

// ── Equipment Checkouts ───────────────────────────────────────
export const MOCK_EQUIPMENT_CHECKOUTS: EquipmentCheckout[] = [
  {
    id: 'ec01', itemId: 'eq01', itemName: 'Cutlass',
    checkoutBy: 'John Mensah', checkoutById: 'w01',
    checkoutTime: new Date().toISOString(),
    expectedReturnTime: new Date(Date.now() + 8 * 3600000).toISOString(),
    supervisorId: 's01', supervisorName: 'Kofi Asante',
    farmZone: 'Banana', purpose: 'Bush clearing',
    isReturned: false, isOverdue: false
  },
  {
    id: 'ec02', itemId: 'eq02', itemName: 'Knapsack Sprayer',
    checkoutBy: 'Ama Owusu', checkoutById: 'w02',
    checkoutTime: new Date(Date.now() - 9 * 3600000).toISOString(),
    expectedReturnTime: new Date(Date.now() - 1 * 3600000).toISOString(),
    supervisorId: 's01', supervisorName: 'Kofi Asante',
    farmZone: 'Okra', purpose: 'Fungicide spray',
    isReturned: false, isOverdue: true
  },
  {
    id: 'ec03', itemId: 'eq01', itemName: 'Cutlass',
    checkoutBy: 'Kwame Boateng', checkoutById: 'w03',
    checkoutTime: new Date(Date.now() - 6 * 3600000).toISOString(),
    expectedReturnTime: new Date(Date.now() - 1 * 3600000).toISOString(),
    returnTime: new Date(Date.now() - 30 * 60000).toISOString(),
    supervisorId: 's01', supervisorName: 'Kofi Asante',
    farmZone: 'Papaya', purpose: 'Pruning',
    isReturned: true, isOverdue: false, returnedCondition: 'good'
  },
];

// ── Stock Requests ────────────────────────────────────────────
export const MOCK_STOCK_REQUESTS: StockRequest[] = [
  {
    id: 'sr01', requestNumber: 'REQ-2026-021',
    requestedBy: 'mgr01', requestedByName: 'Emmanuel Darko',
    requestedByRole: 'farm_manager', requestDate: new Date(Date.now() - 2 * 3600000).toISOString(),
    requiredByDate: new Date(Date.now() + 24 * 3600000).toISOString(),
    farmZone: 'Banana', priority: 'urgent',
    items: [
      { itemId: 'f06', itemName: 'Paraffin Oil', category: 'fungicide', requestedQty: 200, uom: 'lt' },
      { itemId: 'i07', itemName: 'Sefina', category: 'insecticide', requestedQty: 10, uom: 'lt' },
    ],
    status: 'pending', note: 'Needed for weekend spray cycle'
  },
  {
    id: 'sr02', requestNumber: 'REQ-2026-020',
    requestedBy: 'mgr01', requestedByName: 'Emmanuel Darko',
    requestedByRole: 'farm_manager', requestDate: new Date(Date.now() - 1 * 86400000).toISOString(),
    farmZone: 'Okra', priority: 'normal',
    items: [
      { itemId: 'fe01', itemName: 'MAP', category: 'fertilizer', requestedQty: 500, uom: 'kg', dispatchedQty: 500, receivedQty: 500 },
      { itemId: 'fe02', itemName: 'Urea', category: 'fertilizer', requestedQty: 450, uom: 'kg', dispatchedQty: 450, receivedQty: 450 },
    ],
    status: 'received', approvedBy: 'sk01', approvedAt: new Date(Date.now() - 23 * 3600000).toISOString(),
    dispatchedAt: new Date(Date.now() - 20 * 3600000).toISOString(), receivedAt: new Date(Date.now() - 18 * 3600000).toISOString()
  },
];

// ── Spray Plans ───────────────────────────────────────────────
export const MOCK_SPRAY_PLANS: SprayPlan[] = [
  {
    id: 'sp01', planName: 'Banana Block A - Weekly Fungicide Cycle',
    farmZone: 'Banana', cycle: 'weekly',
    startDate: '2026-05-26', endDate: '2026-06-30',
    createdBy: 'Emmanuel Darko', createdAt: new Date().toISOString(),
    status: 'active', totalApplications: 6, completedApplications: 0,
    restockAlertSent: false,
    items: [
      { itemId: 'f06', itemName: 'Paraffin Oil', category: 'fungicide', uom: 'lt', quantityPerApplication: 40, totalPlannedQty: 240, currentStockAtPlanTime: 426, isStockSufficient: true },
      { itemId: 'f07', itemName: 'Serenade ASO SC', category: 'fungicide', uom: 'lt', quantityPerApplication: 6, totalPlannedQty: 36, currentStockAtPlanTime: 34, projectedShortfallDate: '2026-06-16', restockAlertDate: '2026-06-09', isStockSufficient: false },
    ],
    notes: 'Monday + Thursday applications'
  },
  {
    id: 'sp02', planName: 'Okra - Insecticide Monthly Plan',
    farmZone: 'Okra', cycle: 'biweekly',
    startDate: '2026-05-25', endDate: '2026-07-25',
    createdBy: 'Emmanuel Darko', createdAt: new Date().toISOString(),
    status: 'active', totalApplications: 4, completedApplications: 1,
    restockAlertSent: false,
    items: [
      { itemId: 'i01', itemName: 'Spartan 300 OD', category: 'insecticide', uom: 'lt', quantityPerApplication: 3, totalPlannedQty: 12, currentStockAtPlanTime: 13.7, isStockSufficient: true },
      { itemId: 'h01', itemName: 'Kalach 360', category: 'herbicide', uom: 'lt', quantityPerApplication: 9, totalPlannedQty: 36, currentStockAtPlanTime: 45, isStockSufficient: true },
    ],
  }
];

// ── Packing Records ───────────────────────────────────────────
export const MOCK_PACKING_RECORDS: PackingRecord[] = [
  {
    id: 'pr01', date: new Date().toISOString().slice(0, 10),
    stationId: 'ps01', stationName: 'Packing Station A',
    supervisorId: 's02', supervisorName: 'Grace Acheampong',
    farmZone: 'Banana', produce: 'Banana',
    targetBoxes: 300, packedBoxes: 267, rejectedBoxes: 12,
    totalWeight: 8010, shift: 'morning',
    workers: ['Daniel Kumi', 'Abena Frimpong', 'Samuel Tetteh', 'Akosua Boateng']
  },
  {
    id: 'pr02', date: new Date().toISOString().slice(0, 10),
    stationId: 'ps02', stationName: 'Packing Station B',
    supervisorId: 's03', supervisorName: 'Peter Asamoah',
    farmZone: 'Okra', produce: 'Okra',
    targetBoxes: 150, packedBoxes: 143, rejectedBoxes: 7,
    totalWeight: 2145, shift: 'morning',
    workers: ['Yaw Mensah', 'Efua Darko', 'Kojo Owusu']
  },
];

// ── Shipping Records ──────────────────────────────────────────
export const MOCK_SHIPPING_RECORDS: ShippingRecord[] = [
  {
    id: 'sh01', dispatchDate: new Date().toISOString().slice(0, 10),
    destinationName: 'Fresh Farms Export GmbH, Hamburg',
    supervisorId: 's02', produce: 'Banana',
    boxesShipped: 200, weightShipped: 6000,
    vehicleId: 'GH-8844-12', driverName: 'Samuel Owusu',
    invoiceNumber: 'INV-2026-0441'
  },
];

// ── Alerts ───────────────────────────────────────────────────
export const MOCK_AGRIC_ALERTS: AgricAlert[] = [
  {
    id: 'al01', type: 'low_stock', severity: 'critical',
    title: 'Critical: Calcinate Almost Out',
    message: 'Calcinate (Calcium Nitrate) stock is at 75kg, below the minimum of 100kg. Reorder immediately.',
    itemId: 'fe05', itemName: 'Calcinate',
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    isRead: false, isActionRequired: true
  },
  {
    id: 'al02', type: 'plan_shortfall', severity: 'warning',
    title: 'Plan Shortfall: Serenade ASO SC',
    message: 'Based on Banana Block A spray plan, Serenade ASO SC will run out on Jun 16. Restock by Jun 9.',
    itemId: 'f07', itemName: 'Serenade ASO SC',
    createdAt: new Date(Date.now() - 1 * 3600000).toISOString(),
    isRead: false, isActionRequired: true
  },
  {
    id: 'al03', type: 'equipment_overdue', severity: 'warning',
    title: 'Overdue: Knapsack Sprayer',
    message: 'Knapsack Sprayer checked out by Ama Owusu (Okra Zone) is 1 hour overdue. Expected return was 8:00 AM.',
    createdAt: new Date(Date.now() - 30 * 60000).toISOString(),
    isRead: false, isActionRequired: false
  },
  {
    id: 'al04', type: 'restock_request', severity: 'info',
    title: 'New Stock Request: REQ-2026-021',
    message: 'Urgent request from Emmanuel Darko for Paraffin Oil (200L) and Sefina (10L) for Banana zone.',
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    isRead: false, isActionRequired: true
  },
  {
    id: 'al05', type: 'low_stock', severity: 'warning',
    title: 'Low Stock: Chemical Gloves',
    message: 'Chemical Gloves stock (8 pairs) is below minimum threshold (15 pairs). Consider restocking.',
    itemId: 'eq05', itemName: 'Chemical Gloves',
    createdAt: new Date(Date.now() - 4 * 3600000).toISOString(),
    isRead: true, isActionRequired: false
  },
];

// ── Weekly Stock Report ───────────────────────────────────────
export const MOCK_WEEKLY_REPORT: WeeklyStockReport = {
  id: 'wr10', weekNumber: 10,
  weekEnding: '2026-02-07',
  generatedBy: 'Storekeeper Admin',
  generatedAt: '2026-02-07T18:00:00Z',
  items: [
    { itemId: 'f04', itemName: 'NORDOX 75G', category: 'fungicide', uom: 'kg', openingStock: 58.5, received: 0, usageByZone: {}, totalUsage: 0, damaged: 0, closingStock: 58.5 },
    { itemId: 'f06', itemName: 'Paraffin Oil', category: 'fungicide', uom: 'lt', openingStock: 466, received: 0, usageByZone: { Banana: 40 }, totalUsage: 40, damaged: 0, closingStock: 426 },
    { itemId: 'i04', itemName: 'Reeva', category: 'insecticide', uom: 'lt', openingStock: 35.2, received: 0, usageByZone: { Okra: 2, Banana: 2 }, totalUsage: 4, damaged: 0, closingStock: 31.2 },
    { itemId: 'i08', itemName: 'Punto', category: 'insecticide', uom: 'kg', openingStock: 99, received: 0, usageByZone: { Okra: 4, Banana: 4 }, totalUsage: 8, damaged: 0, closingStock: 91 },
  ]
};

export const USAGE_HISTORY = [
  { week: 'Wk 5', fungicide: 42, insecticide: 28, herbicide: 15, fertilizer: 380 },
  { week: 'Wk 6', fungicide: 38, insecticide: 31, herbicide: 18, fertilizer: 420 },
  { week: 'Wk 7', fungicide: 45, insecticide: 25, herbicide: 12, fertilizer: 360 },
  { week: 'Wk 8', fungicide: 51, insecticide: 33, herbicide: 20, fertilizer: 450 },
  { week: 'Wk 9', fungicide: 47, insecticide: 29, herbicide: 16, fertilizer: 390 },
  { week: 'Wk 10', fungicide: 40, insecticide: 27, herbicide: 14, fertilizer: 410 },
];
