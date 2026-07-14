// ============================================================
// MOONLIGHT FRESCO / STOCKINTEL AGRI - Core Types
// Derived from real farm data: Fungicides, Insecticides,
// Herbicides, Fertilizers, Weekly Stock Reports, Daily Work Logs
// ============================================================

export type AgricCategory = 'fungicide' | 'insecticide' | 'herbicide' | 'fertilizer' | 'equipment' | 'seed' | 'other';
export type FarmZone = 'Banana' | 'Okra' | 'Papaya' | 'Tomato' | 'Beans' | 'Bitter Gourd' | 'Bitter Melon' | 'Moringa' | 'Passion Fruit';
export type UOM = 'lt' | 'kg' | 'ml' | 'g' | 'units' | 'bags' | 'L' | 'boxes';
export type ItemStatus = 'in_stock' | 'low_stock' | 'critical' | 'out_of_stock';
export type RequestStatus = 'pending' | 'approved' | 'dispatched' | 'received' | 'rejected';
export type EquipmentStatus = 'available' | 'checked_out' | 'overdue' | 'damaged' | 'maintenance';
export type AdjustmentStatus = 'pending_approval' | 'approved' | 'rejected';
export type UserRole = 'farm_manager' | 'stockkeeper' | 'supervisor' | 'worker' | 'admin';

// ── Agric Inventory Item ──────────────────────────────────────
export interface AgricInventoryItem {
  id: string;
  name: string;
  chemicalComponent?: string;
  category: AgricCategory;
  uom: UOM;
  packSize?: string; // e.g. "1lt", "250ml", "1kg"
  currentStock: number;
  minimumStock: number;        // reorder threshold
  reorderAlertDays: number;    // alert N days before projected runout
  supplierId?: string;
  supplierName?: string;
  unitCost?: number;
  location?: string;           // store shelf/rack
  lastUpdated: string;         // ISO date
  createdBy: string;
  isActive: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deletionNote?: string;
  // Projected usage for planning
  avgWeeklyUsage?: number;
  lastReceivedDate?: string;
  lastReceivedQty?: number;
}

// ── Chemical Usage Log (from monthly usage reports) ──────────
export interface UsageLog {
  id: string;
  itemId: string;
  itemName: string;
  category: AgricCategory;
  date: string;
  quantity: number;
  uom: UOM;
  farmZone: FarmZone;
  appliedBy: string;
  supervisorId?: string;
  batchNumber?: string;
  notes?: string;
  weekNumber?: number;
  weekYear?: number;
  weekStartDate?: string;
  weekEndDate?: string;
}

// ── Weekly Stock Report (from End-of-Week Excel) ─────────────
export interface WeeklyStockReport {
  id: string;
  weekNumber: number;
  weekEnding: string;          // ISO date (Saturday)
  generatedBy: string;
  generatedAt: string;
  items: WeeklyStockItem[];
  totalUsageValue?: number;
  notes?: string;
}

export interface WeeklyStockItem {
  itemId: string;
  itemName: string;
  category: AgricCategory;
  uom: UOM;
  openingStock: number;
  received: number;
  usageByZone: Partial<Record<FarmZone, number>>;
  totalUsage: number;
  damaged: number;
  closingStock: number;
}

// ── Stock Request (Farm Manager → Storekeeper) ───────────────
export interface StockRequest {
  id: string;
  requestNumber: string;       // e.g. "REQ-2026-001"
  requestedBy: string;
  requestedByName: string;
  requestedByRole: UserRole;
  requestDate: string;
  requiredByDate?: string;
  farmZone: FarmZone;
  items: StockRequestItem[];
  status: RequestStatus;
  priority: 'normal' | 'urgent';
  note?: string;
  approvedBy?: string;
  approvedAt?: string;
  dispatchedBy?: string;
  dispatchedAt?: string;
  receivedBy?: string;
  receivedAt?: string;
  rejectionReason?: string;
}

export interface StockRequestItem {
  itemId: string;
  itemName: string;
  category: AgricCategory;
  requestedQty: number;
  requestedUom?: UOM;
  requestedQtyInStockUom?: number;
  dispatchedQty?: number;
  receivedQty?: number;
  uom: UOM;
  note?: string;
}

// ── Equipment Checkout (e.g. cutlass, sprayer, boots) ────────
export interface EquipmentCheckout {
  id: string;
  itemId: string;
  itemName: string;
  checkoutBy: string;          // Worker name
  checkoutById: string;
  checkoutTime: string;        // ISO datetime
  expectedReturnTime?: string;
  returnTime?: string;
  returnedCondition?: 'good' | 'damaged' | 'lost';
  supervisorId: string;
  supervisorName: string;
  farmZone: FarmZone;
  purpose?: string;
  isReturned: boolean;
  isOverdue: boolean;
  notes?: string;
}

// ── Spray / Usage Plan (Farm Manager Planning) ───────────────
export interface SprayPlan {
  id: string;
  planName: string;
  farmZone: FarmZone;
  cycle: 'weekly' | 'biweekly' | 'monthly' | 'custom';
  startDate: string;
  endDate: string;
  createdBy: string;
  createdAt: string;
  status: 'draft' | 'active' | 'completed' | 'paused';
  items: SprayPlanItem[];
  totalApplications: number;
  completedApplications: number;
  restockAlertSent: boolean;
  notes?: string;
}

export interface SprayPlanItem {
  itemId: string;
  itemName: string;
  category: AgricCategory;
  uom: UOM;
  requestedUom?: UOM;
  quantityPerApplication: number;
  quantityPerApplicationInStockUom?: number;
  totalPlannedQty: number;
  totalPlannedQtyInStockUom?: number;
  currentStockAtPlanTime: number;
  shortfallQty?: number;
  projectedShortfallDate?: string;  // when stock will run out
  restockAlertDate?: string;        // days before shortfall
  isStockSufficient: boolean;
}

// ── Packing Station Record ────────────────────────────────────
export interface PackingRecord {
  id: string;
  date: string;
  stationId: string;
  stationName: string;
  supervisorId: string;
  supervisorName: string;
  farmZone: FarmZone;
  produce: string;             // e.g. "Banana", "Okra"
  targetBoxes: number;
  packedBoxes: number;
  rejectedBoxes: number;
  totalWeight?: number;        // kg
  shift: 'morning' | 'afternoon' | 'evening';
  workers: string[];
  notes?: string;
}

export interface PackingStation {
  id: string;
  name: string;
  storageName?: string;
  assignedUserIds: string[];
  assignedUserNames?: string[];
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

// ── Shipping / Dispatch Record ────────────────────────────────
export interface ShippingRecord {
  id: string;
  dispatchDate: string;
  destinationId?: string;
  destinationName: string;
  supervisorId: string;
  stationId?: string;
  stationName?: string;
  storageName?: string;
  produce: string;
  boxesShipped: number;        // auto-reduces packed stock
  weightShipped?: number;
  vehicleId?: string;
  driverName?: string;
  invoiceNumber?: string;
  notes?: string;
}

// ── Stock Adjustment (requires approval) ─────────────────────
export interface StockAdjustment {
  id: string;
  itemId: string;
  itemName: string;
  adjustedBy: string;
  adjustedByName: string;
  requestDate: string;
  oldQuantity: number;
  newQuantity: number;
  difference: number;
  reason: string;
  note: string;
  status: AdjustmentStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
}

// ── Alert ─────────────────────────────────────────────────────
export interface AgricAlert {
  id: string;
  type: 'low_stock' | 'restock_needed' | 'equipment_overdue' | 'plan_shortfall' | 'adjustment_pending' | 'deletion_log' | 'restock_request';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  itemId?: string;
  itemName?: string;
  createdAt: string;
  isRead: boolean;
  isActionRequired: boolean;
  actionUrl?: string;
}
