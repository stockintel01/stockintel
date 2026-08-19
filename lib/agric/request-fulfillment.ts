import type { RequestIssue, RequestReturnCondition, StockRequestItem, UOM } from './types';

const EPSILON = 0.000001;

export function requestedStockQuantity(item: StockRequestItem): number {
  return Number(item.requestedQtyInStockUom ?? item.requestedQty);
}

export function remainingToDispatch(item: StockRequestItem): number {
  return Math.max(0, requestedStockQuantity(item) - Number(item.dispatchedQty ?? 0));
}

export function remainingToReceive(item: StockRequestItem): number {
  return Math.max(0, requestedStockQuantity(item) - Number(item.receivedQty ?? 0));
}

export function awaitingReceipt(item: StockRequestItem): number {
  return Math.max(0, Number(item.dispatchedQty ?? 0) - Number(item.receivedQty ?? 0));
}

export function resolvedReturnQuantity(issue: RequestIssue): number {
  return Number(issue.returnedQty ?? 0) + Number(issue.damagedQty ?? 0) + Number(issue.lostQty ?? 0);
}

export function remainingToReturn(issue: RequestIssue): number {
  if (issue.mode !== 'returnable') return 0;
  return Math.max(0, issue.quantity - resolvedReturnQuantity(issue));
}

export function planRequestIssueReturn(
  issues: RequestIssue[],
  issueId: string,
  quantity: number,
  condition: RequestReturnCondition,
  returnedBy: string,
  returnedAt: string,
  notes?: string,
): { issues: RequestIssue[]; issue: RequestIssue; restoreQuantity: number } {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Return quantity must be greater than zero.');
  const current = issues.find(issue => issue.id === issueId);
  if (!current) throw new Error('This issue record no longer exists.');
  if (current.mode !== 'returnable') throw new Error('Only returnable items can be returned.');
  const outstanding = remainingToReturn(current);
  if (quantity > outstanding + EPSILON) throw new Error(`Return exceeds the outstanding ${outstanding} ${current.uom}.`);

  const returnedQty = Number(current.returnedQty ?? 0) + (condition === 'good' ? quantity : 0);
  const damagedQty = Number(current.damagedQty ?? 0) + (condition === 'damaged' ? quantity : 0);
  const lostQty = Number(current.lostQty ?? 0) + (condition === 'lost' ? quantity : 0);
  const remaining = Math.max(0, current.quantity - returnedQty - damagedQty - lostQty);
  const updated: RequestIssue = {
    ...current,
    returnedQty,
    damagedQty,
    lostQty,
    returnStatus: remaining <= EPSILON ? 'resolved' : 'partially_resolved',
    returnEvents: [
      ...(current.returnEvents ?? []),
      { quantity, condition, returnedAt, returnedBy, notes },
    ],
  };
  return {
    issues: issues.map(issue => issue.id === issueId ? updated : issue),
    issue: updated,
    restoreQuantity: condition === 'good' ? quantity : 0,
  };
}

export function planRequestDispatch(
  items: StockRequestItem[],
  inputs: Array<{ itemId: string; qty: number }>,
): {
  items: StockRequestItem[];
  dispatches: Array<{ itemId: string; quantity: number; uom: UOM }>;
  fullyDispatched: boolean;
} {
  const quantities = new Map<string, number>();
  for (const input of inputs) {
    if (!Number.isFinite(input.qty) || input.qty < 0) throw new Error('Dispatch quantities must be zero or greater.');
    if (input.qty > 0) quantities.set(input.itemId, (quantities.get(input.itemId) ?? 0) + input.qty);
  }
  if (quantities.size === 0) throw new Error('Enter at least one quantity to dispatch.');

  const knownItems = new Map(items.map(item => [item.itemId, item]));
  for (const [itemId, quantity] of quantities) {
    const item = knownItems.get(itemId);
    if (!item) throw new Error('One of the selected items is not part of this request.');
    const remaining = remainingToDispatch(item);
    if (quantity > remaining + EPSILON) throw new Error(`${item.itemName}: dispatch exceeds the remaining ${remaining} ${item.uom}.`);
  }

  const updatedItems = items.map(item => {
    const quantity = quantities.get(item.itemId) ?? 0;
    return quantity > 0 ? { ...item, dispatchedQty: Number(item.dispatchedQty ?? 0) + quantity } : item;
  });
  return {
    items: updatedItems,
    dispatches: [...quantities].map(([itemId, quantity]) => ({ itemId, quantity, uom: knownItems.get(itemId)!.uom })),
    fullyDispatched: updatedItems.every(item => remainingToDispatch(item) <= EPSILON),
  };
}

export function planRequestReceipt(items: StockRequestItem[]): {
  items: StockRequestItem[];
  receipts: Array<{ itemId: string; quantity: number; uom: UOM }>;
  fullyReceived: boolean;
} {
  const receipts: Array<{ itemId: string; quantity: number; uom: UOM }> = [];
  const updatedItems = items.map(item => {
    const outstanding = awaitingReceipt(item);
    if (outstanding <= EPSILON) return item;
    receipts.push({ itemId: item.itemId, quantity: outstanding, uom: item.uom });
    return { ...item, receivedQty: Number(item.dispatchedQty ?? 0) };
  });
  if (receipts.length === 0) throw new Error('There are no new dispatched quantities to receive.');
  return {
    items: updatedItems,
    receipts,
    fullyReceived: updatedItems.every(item => remainingToReceive(item) <= EPSILON),
  };
}
