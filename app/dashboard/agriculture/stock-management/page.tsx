'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search, Plus, Download,
  Package, Edit2, Trash2, Eye,
  Clock, X, Save, Upload
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAgric } from '@/lib/agric/useAgric';
import { AgricInventoryItem, AgricCategory, UOM } from '@/lib/agric/types';
import { useAppStore } from '@/lib/store';
import { parseInventoryFile } from '@/lib/inventory-import';

const CATEGORY_LABELS: Record<AgricCategory, string> = {
  fungicide: 'Fungicide', insecticide: 'Insecticide', herbicide: 'Herbicide',
  fertilizer: 'Fertilizer', equipment: 'Equipment', seed: 'Seed', other: 'Other',
};

const CATEGORY_COLORS: Record<AgricCategory, string> = {
  fungicide: 'bg-blue-100 text-blue-800',
  insecticide: 'bg-orange-100 text-orange-800',
  herbicide: 'bg-yellow-100 text-yellow-800',
  fertilizer: 'bg-green-100 text-green-800',
  equipment: 'bg-slate-100 text-slate-800',
  seed: 'bg-purple-100 text-purple-800',
  other: 'bg-gray-100 text-gray-800',
};

function getStockStatus(item: AgricInventoryItem) {
  if (!item.isActive) return { label: 'Deleted', color: 'bg-gray-100 text-gray-500', bar: 'bg-gray-300', level: 0 };
  if (item.currentStock === 0) return { label: 'Out of Stock', color: 'bg-red-100 text-red-700', bar: 'bg-red-500', level: 0 };
  if (item.currentStock <= item.minimumStock * 0.5) return { label: 'Critical', color: 'bg-red-100 text-red-700', bar: 'bg-red-500', level: item.currentStock / item.minimumStock };
  if (item.currentStock <= item.minimumStock) return { label: 'Low Stock', color: 'bg-amber-100 text-amber-700', bar: 'bg-amber-500', level: item.currentStock / item.minimumStock };
  return { label: 'In Stock', color: 'bg-green-100 text-green-700', bar: 'bg-green-500', level: Math.min(item.currentStock / (item.minimumStock * 3), 1) };
}

interface AdjustmentModal {
  item: AgricInventoryItem;
  newQty: number;
  note: string;
}

export default function StockManagementPage() {
  const { inventory: rawInventory, addItem, deleteItem, submitAdjustment } = useAgric();
  const { user } = useAppStore();
  const currentUser = user?.name ?? 'Storekeeper';
  const currentUserId = user?.id ?? 'user';
  const canManageStock = !!user && ['super_admin', 'owner', 'manager'].includes(user.role);
  const [inventory, setLocalInventory] = useState<AgricInventoryItem[]>([]);
  useEffect(() => { setLocalInventory(rawInventory); }, [rawInventory]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<AgricCategory | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'low' | 'critical' | 'ok'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'stock' | 'category'>('category');
  const [selectedItem, setSelectedItem] = useState<AgricInventoryItem | null>(null);
  const [adjustModal, setAdjustModal] = useState<AdjustmentModal | null>(null);
  const [deletionLog, setDeletionLog] = useState<{ item: AgricInventoryItem; note: string; by: string; at: string }[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState<Partial<AgricInventoryItem>>({ category: 'fungicide', uom: 'lt', isActive: true, reorderAlertDays: 7 });
  const [showDeletionLog, setShowDeletionLog] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    return (inventory.length > 0 ? inventory : rawInventory)
      .filter(item => {
        const matchSearch = item.name.toLowerCase().includes(search.toLowerCase()) ||
          (item.chemicalComponent || '').toLowerCase().includes(search.toLowerCase());
        const matchCat = categoryFilter === 'all' || item.category === categoryFilter;
        const status = getStockStatus(item);
        const matchStatus = statusFilter === 'all' ||
          (statusFilter === 'critical' && (status.label === 'Critical' || status.label === 'Out of Stock')) ||
          (statusFilter === 'low' && status.label === 'Low Stock') ||
          (statusFilter === 'ok' && status.label === 'In Stock');
        return matchSearch && matchCat && matchStatus && item.isActive;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'stock') return a.currentStock - b.currentStock;
        return a.category.localeCompare(b.category);
      });
  }, [inventory, rawInventory, search, categoryFilter, statusFilter, sortBy]);

  const stats = useMemo(() => ({
    total: (inventory.length > 0 ? inventory : rawInventory).filter(i => i.isActive).length,
    critical: inventory.filter(i => i.isActive && getStockStatus(i).label === 'Critical').length,
    low: inventory.filter(i => i.isActive && getStockStatus(i).label === 'Low Stock').length,
    outOfStock: inventory.filter(i => i.isActive && i.currentStock === 0).length,
  }), [inventory, rawInventory]);

  async function handleSoftDelete(item: AgricInventoryItem, note: string) {
    setDeletionLog(prev => [...prev, { item, note, by: currentUser, at: new Date().toISOString() }]);
    await deleteItem(item.id, note);
    setSelectedItem(null);
  }

  async function handleAdjustSubmit() {
    if (!adjustModal) return;
    await submitAdjustment({
      itemId: adjustModal.item.id, itemName: adjustModal.item.name,
      adjustedBy: currentUserId, adjustedByName: currentUser,
      requestDate: new Date().toISOString(),
      oldQuantity: adjustModal.item.currentStock, newQuantity: adjustModal.newQty,
      difference: adjustModal.newQty - adjustModal.item.currentStock,
      reason: adjustModal.note, note: adjustModal.note, status: 'pending_approval',
    });
    setAdjustModal(null);
  }

  async function handleAddItem() {
    if (!newItem.name || !newItem.category) return;
    await addItem({
      name: newItem.name!, chemicalComponent: newItem.chemicalComponent,
      category: newItem.category as AgricCategory, uom: newItem.uom || 'lt',
      packSize: newItem.packSize, currentStock: newItem.currentStock || 0,
      minimumStock: newItem.minimumStock || 5, reorderAlertDays: newItem.reorderAlertDays || 7,
      location: newItem.location, unitCost: newItem.unitCost,
      lastUpdated: new Date().toISOString().slice(0, 10), createdBy: currentUser, isActive: true,
    });
    setNewItem({ category: 'fungicide', uom: 'lt', isActive: true, reorderAlertDays: 7 });
    setShowAddModal(false);
  }

  async function handleImportFile(file: File | undefined) {
    if (!file || !canManageStock) return;
    setIsImporting(true);
    setImportMessage('');
    setImportError('');
    try {
      const result = await parseInventoryFile(file);
      if (result.errors.length) {
        setImportError(result.errors.slice(0, 8).join('\n'));
        return;
      }
      for (const item of result.items) {
        await addItem({ ...item, createdBy: currentUser });
      }
      setImportMessage(`Imported ${result.items.length.toLocaleString()} stock item${result.items.length === 1 ? '' : 's'} from ${file.name}.`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Import failed.');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function exportCSV() {
    const rows = [
      ['Name', 'Chemical Component', 'Category', 'UOM', 'Current Stock', 'Min Stock', 'Status', 'Location', 'Last Updated'],
      ...filtered.map(i => [i.name, i.chemicalComponent || '', i.category, i.uom, i.currentStock, i.minimumStock, getStockStatus(i).label, i.location || '', i.lastUpdated])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a'); a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`; a.download = `agric-stock-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Stock Management</h1>
          <p className="text-muted-foreground text-sm">Track, adjust, and manage all farm chemical & equipment inventory</p>
        </div>
        <div className="flex gap-2">
          {deletionLog.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setShowDeletionLog(true)}>
              <Eye className="w-4 h-4 mr-1" /> Deletion Log ({deletionLog.length})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-1" /> Export CSV
          </Button>
          {canManageStock && (
            <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => setShowAddModal(true)}>
              <Plus className="w-4 h-4 mr-1" /> Add Item
            </Button>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Active SKUs', value: stats.total, color: 'text-foreground' },
          { label: 'Out of Stock', value: stats.outOfStock, color: 'text-red-600' },
          { label: 'Critical (< 50% min)', value: stats.critical, color: 'text-red-500' },
          { label: 'Low Stock', value: stats.low, color: 'text-amber-600' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search items or chemical components..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="border rounded-md px-3 py-2 text-sm bg-background" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value as AgricCategory | 'all')}>
              <option value="all">All Categories</option>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select className="border rounded-md px-3 py-2 text-sm bg-background" value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}>
              <option value="all">All Status</option>
              <option value="critical">Critical / Out of Stock</option>
              <option value="low">Low Stock</option>
              <option value="ok">In Stock</option>
            </select>
            <select className="border rounded-md px-3 py-2 text-sm bg-background" value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}>
              <option value="category">Sort: Category</option>
              <option value="name">Sort: Name</option>
              <option value="stock">Sort: Stock Level</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {canManageStock && (
        <Card
          className="border-dashed"
          onDragOver={event => event.preventDefault()}
          onDrop={event => {
            event.preventDefault();
            void handleImportFile(event.dataTransfer.files?.[0]);
          }}
        >
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Bulk import agriculture stock</p>
              <p className="text-sm text-muted-foreground">Drop a CSV/XLSX file here or browse. Required columns: name and current stock. Optional: category, unit, minimum stock, unit cost, location.</p>
              {importMessage && <p className="mt-2 text-sm text-green-700">{importMessage}</p>}
              {importError && <pre className="mt-2 whitespace-pre-wrap rounded-md bg-red-50 p-2 text-xs text-red-700">{importError}</pre>}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              onChange={event => void handleImportFile(event.target.files?.[0])}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
              <Upload className="mr-2 h-4 w-4" /> {isImporting ? 'Importing...' : 'Browse File'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Inventory Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Item</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Category</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Stock Level</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Min Stock</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Location</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, i) => {
                  const status = getStockStatus(item);
                  const daysLeft = item.avgWeeklyUsage && item.currentStock > 0 ? Math.floor(item.currentStock / (item.avgWeeklyUsage / 7)) : null;
                  return (
                    <tr key={item.id} className={`border-b hover:bg-accent/30 transition-colors ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{item.name}</p>
                        {item.chemicalComponent && <p className="text-xs text-muted-foreground truncate max-w-48">{item.chemicalComponent}</p>}
                        {daysLeft !== null && daysLeft <= 14 && (
                          <p className="text-xs text-red-500 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" /> ~{daysLeft} days left at avg usage
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[item.category]}`}>
                          {CATEGORY_LABELS[item.category]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${status.bar}`} style={{ width: `${Math.min(status.level * 100, 100)}%` }} />
                          </div>
                          <span className="font-mono font-medium">{item.currentStock} {item.uom}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{item.minimumStock} {item.uom}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{item.location || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.color}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setSelectedItem(item)}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setAdjustModal({ item, newQty: item.currentStock, note: '' })}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          {canManageStock && (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setSelectedItem(item)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>No items match your filters</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Adjust Stock Modal */}
      {adjustModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Adjust Stock: {adjustModal.item.name}
                <button onClick={() => setAdjustModal(null)}><X className="w-4 h-4" /></button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                ⚠️ Manual adjustments require a reason note. Manager will be notified for approval.
              </div>
              <div>
                <label className="text-sm font-medium">Current Stock</label>
                <p className="text-2xl font-bold">{adjustModal.item.currentStock} {adjustModal.item.uom}</p>
              </div>
              <div>
                <label className="text-sm font-medium">New Quantity ({adjustModal.item.uom})</label>
                <Input type="number" step="0.1" value={adjustModal.newQty} onChange={e => setAdjustModal(prev => prev ? { ...prev, newQty: parseFloat(e.target.value) || 0 } : null)} className="mt-1" />
                <p className={`text-xs mt-1 ${adjustModal.newQty > adjustModal.item.currentStock ? 'text-green-600' : adjustModal.newQty < adjustModal.item.currentStock ? 'text-red-600' : 'text-muted-foreground'}`}>
                  {adjustModal.newQty !== adjustModal.item.currentStock ? `${adjustModal.newQty > adjustModal.item.currentStock ? '+' : ''}${(adjustModal.newQty - adjustModal.item.currentStock).toFixed(1)} ${adjustModal.item.uom} change` : 'No change'}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">Reason / Note *</label>
                <textarea className="w-full mt-1 border rounded-md p-2 text-sm resize-none" rows={3} placeholder="e.g. Physical count correction, spillage, damaged stock..." value={adjustModal.note} onChange={e => setAdjustModal(prev => prev ? { ...prev, note: e.target.value } : null)} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setAdjustModal(null)}>Cancel</Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={handleAdjustSubmit} disabled={!adjustModal.note.trim()}>
                  <Save className="w-4 h-4 mr-1" /> Submit for Approval
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Item Detail / Delete Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                {selectedItem.name}
                <button onClick={() => setSelectedItem(null)}><X className="w-4 h-4" /></button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ['Chemical Component', selectedItem.chemicalComponent || '—'],
                  ['Category', CATEGORY_LABELS[selectedItem.category]],
                  ['Current Stock', `${selectedItem.currentStock} ${selectedItem.uom}`],
                  ['Minimum Stock', `${selectedItem.minimumStock} ${selectedItem.uom}`],
                  ['Pack Size', selectedItem.packSize || '—'],
                  ['Location', selectedItem.location || '—'],
                  ['Avg Weekly Usage', selectedItem.avgWeeklyUsage ? `${selectedItem.avgWeeklyUsage} ${selectedItem.uom}/week` : '—'],
                  ['Last Updated', selectedItem.lastUpdated],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="font-medium">{value}</p>
                  </div>
                ))}
              </div>
              {canManageStock && <div className="border-t pt-4">
                <p className="text-sm font-medium text-red-600 mb-2">Delete Item</p>
                <p className="text-xs text-muted-foreground mb-3">Item will be soft-deleted. The manager will receive a full deletion log with your note.</p>
                <DeleteWithNote onConfirm={(note) => handleSoftDelete(selectedItem, note)} onCancel={() => setSelectedItem(null)} />
              </div>}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Add New Item <button onClick={() => setShowAddModal(false)}><X className="w-4 h-4" /></button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-sm font-medium">Item Name *</label>
                  <Input className="mt-1" placeholder="e.g. Mancozeb 80WP" value={newItem.name || ''} onChange={e => setNewItem(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium">Chemical Component</label>
                  <Input className="mt-1" placeholder="e.g. Mancozeb 800g/kg" value={newItem.chemicalComponent || ''} onChange={e => setNewItem(p => ({ ...p, chemicalComponent: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Category *</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={newItem.category} onChange={e => setNewItem(p => ({ ...p, category: e.target.value as AgricCategory }))}>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Unit of Measure</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={newItem.uom} onChange={e => setNewItem(p => ({ ...p, uom: e.target.value as UOM }))}>
                    {['lt', 'kg', 'ml', 'g', 'units', 'bags', 'L', 'boxes'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Initial Stock</label>
                  <Input type="number" className="mt-1" placeholder="0" value={newItem.currentStock || ''} onChange={e => setNewItem(p => ({ ...p, currentStock: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Minimum Stock (reorder point)</label>
                  <Input type="number" className="mt-1" placeholder="5" value={newItem.minimumStock || ''} onChange={e => setNewItem(p => ({ ...p, minimumStock: parseFloat(e.target.value) || 5 }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Pack Size / Conversion</label>
                  <Input className="mt-1" placeholder="e.g. 25kg per bag, 20L per box" value={newItem.packSize || ''} onChange={e => setNewItem(p => ({ ...p, packSize: e.target.value }))} />
                  <p className="mt-1 text-[11px] text-muted-foreground">Use this when stock is stored as bags/boxes but teams request kg, g, L, or ml.</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Storage Location</label>
                  <Input className="mt-1" placeholder="e.g. Rack A1" value={newItem.location || ''} onChange={e => setNewItem(p => ({ ...p, location: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Unit Cost ($)</label>
                  <Input type="number" className="mt-1" placeholder="0.00" value={newItem.unitCost || ''} onChange={e => setNewItem(p => ({ ...p, unitCost: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Alert (days before runout)</label>
                  <Input type="number" className="mt-1" placeholder="7" value={newItem.reorderAlertDays || ''} onChange={e => setNewItem(p => ({ ...p, reorderAlertDays: parseInt(e.target.value) || 7 }))} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowAddModal(false)}>Cancel</Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={handleAddItem} disabled={!newItem.name}>
                  <Plus className="w-4 h-4 mr-1" /> Add Item
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Deletion Log Modal */}
      {showDeletionLog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Deletion Log (Manager View) <button onClick={() => setShowDeletionLog(false)}><X className="w-4 h-4" /></button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {deletionLog.map((log, i) => (
                <div key={i} className="p-3 rounded-lg border bg-red-50 border-red-200 text-sm">
                  <div className="flex justify-between">
                    <p className="font-medium text-red-800">{log.item.name}</p>
                    <p className="text-xs text-red-600">{new Date(log.at).toLocaleString()}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{log.item.category} · Stock was: {log.item.currentStock} {log.item.uom}</p>
                  <p className="text-xs mt-1"><span className="font-medium">Reason:</span> {log.note}</p>
                  <p className="text-xs text-muted-foreground">Deleted by: {log.by}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function DeleteWithNote({ onConfirm, onCancel }: { onConfirm: (note: string) => void; onCancel: () => void }) {
  const [note, setNote] = useState('');
  return (
    <div className="space-y-2">
      <textarea className="w-full border rounded-md p-2 text-sm resize-none border-red-200" rows={2} placeholder="Reason for deletion (required — visible to manager)..." value={note} onChange={e => setNote(e.target.value)} />
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" variant="destructive" disabled={!note.trim()} onClick={() => onConfirm(note)}>
          <Trash2 className="w-3 h-3 mr-1" /> Confirm Delete
        </Button>
      </div>
    </div>
  );
}
