export interface InventoryLevel {
  itemId: string;
  name: string;
  quantity: number;
  minimum: number;
  unit: string | null;
}

export interface LowStockItem extends InventoryLevel {
  severity: 'warning' | 'critical';
}

export interface ActiveAlertState {
  alertKey: string;
  episodeStartedAt: string;
}

export interface LowStockDiff {
  started: LowStockItem[];
  continuing: Array<{ item: LowStockItem; episodeStartedAt: string }>;
  resolvedKeys: string[];
}

export const LOW_STOCK_ALERT_PREFIX = 'inventory.low_stock:';
export const LOW_STOCK_SCAN_WINDOW_MINUTES = 15;

export function lowStockAlertKey(itemId: string): string {
  return `${LOW_STOCK_ALERT_PREFIX}${itemId}`;
}

/**
 * An item is low at or below its minimum, matching the in-app stock status. Items
 * without a minimum never alert: a WhatsApp message interrupts someone in the field,
 * so an unconfigured threshold is not a reason to send one.
 */
export function findLowStockItems(levels: InventoryLevel[]): LowStockItem[] {
  return levels
    .filter(level => Number.isFinite(level.quantity) && Number.isFinite(level.minimum)
      && level.minimum > 0 && level.quantity <= level.minimum)
    .map(level => ({
      ...level,
      severity: level.quantity <= level.minimum * 0.5 ? 'critical' as const : 'warning' as const,
    }))
    .sort((a, b) =>
      (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1)
      || a.quantity / a.minimum - b.quantity / b.minimum
      || a.name.localeCompare(b.name));
}

/** Separates items that just crossed their minimum from items already being tracked, and tracked items that recovered. */
export function diffLowStockEpisodes(lowItems: LowStockItem[], activeStates: ActiveAlertState[]): LowStockDiff {
  const active = new Map(
    activeStates
      .filter(state => state.alertKey.startsWith(LOW_STOCK_ALERT_PREFIX))
      .map(state => [state.alertKey, state]),
  );
  const lowKeys = new Set<string>();
  const started: LowStockItem[] = [];
  const continuing: LowStockDiff['continuing'] = [];

  for (const item of lowItems) {
    const key = lowStockAlertKey(item.itemId);
    lowKeys.add(key);
    const state = active.get(key);
    if (state) continuing.push({ item, episodeStartedAt: state.episodeStartedAt });
    else started.push(item);
  }

  return { started, continuing, resolvedKeys: [...active.keys()].filter(key => !lowKeys.has(key)) };
}

export function formatQuantity(value: number): string {
  return Number.isFinite(value) ? String(Number(value.toFixed(2))) : '0';
}

function describeItem(item: LowStockItem): string {
  const unit = item.unit ? ` ${item.unit}` : '';
  const name = item.name.replace(/\s+/g, ' ').trim() || 'Unnamed item';
  return `${name} ${formatQuantity(item.quantity)}${unit} (min ${formatQuantity(item.minimum)}${unit})`;
}

/** Fits as many items as the length allows, then counts the rest: "Tilt 2 L (min 5 L); +3 more". */
export function summarizeLowStockItems(items: LowStockItem[], maxLength = 300): { itemCount: string; summary: string } {
  const itemCount = `${items.length} ${items.length === 1 ? 'item' : 'items'}`;
  if (!items.length) return { itemCount, summary: 'No items' };

  const descriptions = items.map(describeItem);
  const render = (shown: number) => {
    const hidden = descriptions.length - shown;
    return descriptions.slice(0, shown).join('; ') + (hidden > 0 ? `; +${hidden} more` : '');
  };

  for (let shown = descriptions.length; shown >= 1; shown -= 1) {
    const text = render(shown);
    if (text.length <= maxLength) return { itemCount, summary: text };
  }

  const hidden = descriptions.length - 1;
  const suffix = hidden > 0 ? `; +${hidden} more` : '';
  const available = Math.max(1, maxLength - suffix.length - 1);
  return { itemCount, summary: `${descriptions[0].slice(0, available).trimEnd()}…${suffix}` };
}

export function renderLowStockTemplateParameters(organizationName: string, items: LowStockItem[]): string[] {
  const { itemCount, summary } = summarizeLowStockItems(items);
  return [organizationName, itemCount, summary];
}

/** Reads items back out of a stored event payload, dropping anything malformed. */
export function parseLowStockPayload(payload: unknown): LowStockItem[] {
  const items = typeof payload === 'object' && payload !== null
    ? (payload as { items?: unknown }).items
    : undefined;
  if (!Array.isArray(items)) return [];

  return items.flatMap(value => {
    if (typeof value !== 'object' || value === null) return [];
    const item = value as Record<string, unknown>;
    if (typeof item.itemId !== 'string' || typeof item.name !== 'string'
      || typeof item.quantity !== 'number' || typeof item.minimum !== 'number') return [];
    return [{
      itemId: item.itemId,
      name: item.name,
      quantity: item.quantity,
      minimum: item.minimum,
      unit: typeof item.unit === 'string' ? item.unit : null,
      severity: item.severity === 'critical' ? 'critical' as const : 'warning' as const,
    }];
  });
}

function fnv1a(input: string, seed: number): string {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function scanWindowStart(now: Date, minutes = LOW_STOCK_SCAN_WINDOW_MINUTES): Date {
  const windowMs = minutes * 60_000;
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

/**
 * Overlapping scans in the same window produce the same key, so they queue one event.
 * A later window gets a new key, so an item that recovers and drops again alerts again.
 */
export function lowStockEventKey(started: LowStockItem[], windowStart: Date): string {
  const ids = started.map(item => item.itemId).sort().join('|');
  return `inventory.low_stock:${windowStart.toISOString()}:${fnv1a(ids, 0x811c9dc5)}${fnv1a(ids, 0x9747b28c)}`;
}
