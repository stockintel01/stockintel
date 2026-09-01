// ============================================================
// STOCKINTEL AGRI - Core operational types
// ============================================================

export type AgricCategory = 'fungicide' | 'insecticide' | 'herbicide' | 'fertilizer' | 'equipment' | 'seed' | 'other';
export type FarmZone = 'Banana' | 'Okra' | 'Papaya' | 'Tomato' | 'Beans' | 'Bitter Gourd' | 'Bitter Melon' | 'Moringa' | 'Passion Fruit';
export type UOM = 'lt' | 'kg' | 'ml' | 'g' | 'units' | 'bags' | 'L' | 'boxes';
export type ItemStatus = 'in_stock' | 'low_stock' | 'critical' | 'out_of_stock';
export type RequestStatus = 'draft' | 'pending' | 'approved' | 'partially_fulfilled' | 'dispatched' | 'received' | 'rejected';
export type RequestItemMode = 'consumable' | 'returnable';
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
  sourceType?: 'manual' | 'stock_request';
  sourceRequestId?: string;
  sourceRequestNumber?: string;
  sourceIssueId?: string;
  recordedBy?: string;
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
  lastDispatchedAt?: string;
  receivedBy?: string;
  receivedAt?: string;
  rejectionReason?: string;
  fulfillmentHistory?: RequestFulfillmentEvent[];
  issueHistory?: RequestIssue[];
}

export interface RequestFulfillmentEvent {
  type: 'dispatch' | 'receipt' | 'usage' | 'return';
  recordedAt: string;
  recordedBy: string;
  items: Array<{ itemId: string; quantity: number; uom: UOM; issueId?: string; condition?: RequestReturnCondition }>;
}

export type RequestReturnCondition = 'good' | 'damaged' | 'lost';

export interface RequestReturnEvent {
  quantity: number;
  condition: RequestReturnCondition;
  returnedAt: string;
  returnedBy: string;
  notes?: string;
}

export interface RequestIssue {
  id: string;
  itemId: string;
  itemName: string;
  category: AgricCategory;
  quantity: number;
  uom: UOM;
  mode: RequestItemMode;
  issueDate: string;
  issuedAt: string;
  issuedBy: string;
  issuedToName: string;
  expectedReturnDate?: string;
  notes?: string;
  usageStatus: 'pending' | 'used' | 'not_applicable';
  usedDate?: string;
  usedAt?: string;
  usedBy?: string;
  returnedQty?: number;
  damagedQty?: number;
  lostQty?: number;
  returnStatus: 'not_applicable' | 'out' | 'partially_resolved' | 'resolved';
  returnEvents?: RequestReturnEvent[];
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
  mode: RequestItemMode;
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
  applicationHistory?: SprayApplicationEvent[];
  restockAlertSent: boolean;
  notes?: string;
}

export interface SprayApplicationEvent {
  appliedAt: string;
  recordedAt: string;
  recordedBy: string;
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
  packageType?: string;
  packageSize?: string;
  qualityGrade?: string;
  lotNumber?: string;
  palletId?: string;
  storageLocation?: string;
  inspectionStatus?: PackingInspectionStatus;
  inspectedBoxes?: number;
  acceptedBoxes?: number;
  reworkBoxes?: number;
  inspectorId?: string;
  inspectorName?: string;
  inspectedAt?: string;
  inspectionNotes?: string;
  lastQualityEventId?: string;
  fulfilmentPlanId?: string;
  fulfilmentOccurrenceDate?: string;
  customerName?: string;
  notes?: string;
}

export type PackingInspectionStatus = 'awaiting_inspection' | 'partially_accepted' | 'accepted' | 'rework' | 'rejected';
export type PackingQualityEventType = 'inspection' | 'rework_resolution' | 'correction';

export interface PackingQualityEvent {
  id: string;
  packingRecordId: string;
  eventType: PackingQualityEventType;
  stationId: string;
  stationName: string;
  produce: string;
  packageType: string;
  packageSize?: string;
  qualityGrade: string;
  lotNumber: string;
  palletId?: string;
  storageLocation?: string;
  packedDelta: number;
  inspectedDelta: number;
  acceptedDelta: number;
  rejectedDelta: number;
  reworkDelta: number;
  reason?: string;
  notes?: string;
  inspectorId: string;
  inspectorName: string;
  inspectedAt: string;
  createdAt?: unknown;
}

export interface PackingQualityConfig {
  id: string;
  packageTypes: string[];
  packageSizes: string[];
  qualityGrades: string[];
  rejectionReasons: string[];
  updatedAt?: unknown;
}

export type PackingRecurrence = 'none' | 'weekly' | 'biweekly' | 'monthly';

export interface PackingFulfilmentPlan {
  id: string;
  activityName: string;
  customerName: string;
  destinationName?: string;
  stationId: string;
  stationName: string;
  farmZone: FarmZone;
  produce: string;
  targetBoxes: number;
  startDate: string;
  dueTime?: string;
  recurrence: PackingRecurrence;
  endDate?: string;
  shipmentRequired: boolean;
  crewProfileId?: string;
  transportProfileId?: string;
  status: 'active' | 'paused' | 'archived';
  notes?: string;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PackingCrewProfile {
  id: string;
  name: string;
  workers: string[];
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PackingTransportProfile {
  id: string;
  label: string;
  vehicleId: string;
  driverName: string;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
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
export interface ShippingAllocation {
  packingRecordId: string;
  lotNumber: string;
  qualityGrade?: string;
  palletId?: string;
  boxes: number;
}

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
  fulfilmentPlanId?: string;
  fulfilmentOccurrenceDate?: string;
  allocations?: ShippingAllocation[];
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
