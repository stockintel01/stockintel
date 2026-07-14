'use client';

import { useState } from 'react';
import {
  Plus, CalendarDays, AlertTriangle, CheckCircle2,
  FlaskConical, X, ChevronRight, Clock, Bell, Target
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/lib/store';
import { useAgric } from '@/lib/agric/useAgric';
import { SprayPlan, SprayPlanItem, FarmZone, UOM } from '@/lib/agric/types';
import { getAgricultureProfile } from '@/lib/agric/config';
import { calculateRestockByDate, compatibleUnits, convertQuantity, formatQuantity } from '@/lib/agric/units';

const CYCLE_LABELS = { weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly', custom: 'Custom' };
const STATUS_COLORS = {
  active: 'bg-green-100 text-green-700',
  draft: 'bg-gray-100 text-gray-700',
  completed: 'bg-blue-100 text-blue-700',
  paused: 'bg-amber-100 text-amber-700',
};

function getCycleApplications(cycle: string, start: string, end: string): number {
  const days = Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86400000));
  if (cycle === 'weekly') return Math.ceil(days / 7);
  if (cycle === 'biweekly') return Math.ceil(days / 14);
  if (cycle === 'monthly') return Math.ceil(days / 30);
  return 1;
}

export default function PlannerPage() {
  const { plans, inventory, createPlan, markApplication } = useAgric();
  const { user, organization } = useAppStore();
  const farmZones = getAgricultureProfile(organization?.settings).farmZones.length ? getAgricultureProfile(organization?.settings).farmZones : ['Main Farm'];
  const currentUserName = user?.name ?? 'Farm Manager';
  const [selectedPlan, setSelectedPlan] = useState<SprayPlan | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newPlan, setNewPlan] = useState<Partial<SprayPlan>>({
    farmZone: farmZones[0] as FarmZone, cycle: 'weekly', status: 'draft', items: []
  });
  const [newPlanItem, setNewPlanItem] = useState<{ itemId: string; qtyPerApp: number; uom?: UOM }>({ itemId: '', qtyPerApp: 0 });
  const [filter, setFilter] = useState<'all' | 'active' | 'draft' | 'completed'>('all');

  const filtered = plans.filter(p => filter === 'all' || p.status === filter);
  const alerts = plans.filter(p => p.status === 'active' && p.items.some(i => !i.isStockSufficient));

  function addPlanItem() {
    if (!newPlanItem.itemId || !newPlanItem.qtyPerApp) return;
    const invItem = inventory.find(i => i.id === newPlanItem.itemId);
    if (!invItem) return;
    const apps = getCycleApplications(newPlan.cycle || 'weekly', newPlan.startDate || '', newPlan.endDate || '');
    const requestedUom = newPlanItem.uom ?? invItem.uom;
    const qtyPerAppStockUom = convertQuantity(newPlanItem.qtyPerApp, requestedUom, invItem.uom);
    const totalQty = newPlanItem.qtyPerApp * apps;
    const totalQtyStockUom = qtyPerAppStockUom * apps;
    const sufficient = invItem.currentStock >= totalQtyStockUom;
    const applicationsCovered = qtyPerAppStockUom > 0 ? Math.floor(invItem.currentStock / qtyPerAppStockUom) : 0;
    const cycleDays = newPlan.cycle === 'monthly' ? 30 : newPlan.cycle === 'biweekly' ? 14 : newPlan.cycle === 'weekly' ? 7 : 1;
    const projectedShortfallDate = !sufficient
      ? new Date(new Date(newPlan.startDate || new Date()).getTime() + Math.max(0, applicationsCovered) * 86400000 * cycleDays).toISOString().slice(0, 10)
      : undefined;

    const item: SprayPlanItem = {
      itemId: invItem.id, itemName: invItem.name,
      category: invItem.category as any, uom: invItem.uom as any, requestedUom,
      quantityPerApplication: newPlanItem.qtyPerApp,
      quantityPerApplicationInStockUom: qtyPerAppStockUom,
      totalPlannedQty: totalQty,
      totalPlannedQtyInStockUom: totalQtyStockUom,
      currentStockAtPlanTime: invItem.currentStock,
      shortfallQty: Math.max(0, totalQtyStockUom - invItem.currentStock),
      isStockSufficient: sufficient,
      projectedShortfallDate,
      restockAlertDate: calculateRestockByDate(projectedShortfallDate),
    };
    setNewPlan(p => ({ ...p, items: [...(p.items || []), item] }));
    setNewPlanItem({ itemId: '', qtyPerApp: 0 });
  }

  async function submitPlan() {
    const apps = getCycleApplications(newPlan.cycle || 'weekly', newPlan.startDate || '', newPlan.endDate || '');
    await createPlan({
      planName: newPlan.planName || `${newPlan.farmZone} Plan`,
      farmZone: newPlan.farmZone as FarmZone,
      cycle: newPlan.cycle as any,
      startDate: newPlan.startDate!, endDate: newPlan.endDate!,
      createdBy: currentUserName, createdAt: new Date().toISOString(),
      status: 'active', totalApplications: apps, completedApplications: 0,
      restockAlertSent: false, items: newPlan.items || [], notes: newPlan.notes,
    });
    setNewPlan({ farmZone: 'Banana', cycle: 'weekly', status: 'draft', items: [] });
    setShowNew(false);
  }

  async function markApplicationComplete(planId: string) {
    const plan = plans.find(p => p.id === planId);
    if (plan) await markApplication(planId, plan.completedApplications);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Spray & Usage Planner</h1>
          <p className="text-muted-foreground text-sm">Plan chemical application cycles. Get alerts when stock won't last the full cycle.</p>
        </div>
        <Button className="bg-green-600 hover:bg-green-700" onClick={() => setShowNew(true)}>
          <Plus className="w-4 h-4 mr-1" /> New Plan
        </Button>
      </div>

      {/* Stock Shortfall Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map(plan => {
            const shortItems = plan.items.filter(i => !i.isStockSufficient);
            return (
              <div key={plan.id} className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <Bell className="w-5 h-5 text-amber-600 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-amber-800">{plan.planName}</p>
                  <p className="text-sm text-amber-700">
                    Stock shortfall detected: {shortItems.map(i => `${i.itemName} (need ${formatQuantity(i.totalPlannedQtyInStockUom ?? i.totalPlannedQty, i.uom)}, have ${formatQuantity(i.currentStockAtPlanTime, i.uom)})`).join(', ')}
                  </p>
                  {shortItems[0]?.projectedShortfallDate && (
                    <p className="text-xs text-amber-600 mt-1">
                      ⚠ Stock will run out around {new Date(shortItems[0].projectedShortfallDate).toLocaleDateString()}. Request restock by {shortItems[0].restockAlertDate ? new Date(shortItems[0].restockAlertDate).toLocaleDateString() : 'as soon as possible'}.
                    </p>
                  )}
                </div>
                <Button size="sm" variant="outline" className="border-amber-300 text-amber-700" onClick={() => setSelectedPlan(plan)}>
                  View Plan
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 border rounded-md p-1 bg-muted/30 w-fit">
        {[['all', 'All Plans'], ['active', 'Active'], ['draft', 'Draft'], ['completed', 'Completed']].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v as any)} className={`px-3 py-1 rounded text-sm transition-colors ${filter === v ? 'bg-background shadow-sm font-medium' : 'hover:bg-background/60'}`}>{l}</button>
        ))}
      </div>

      {/* Plans Grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {filtered.map(plan => {
          const shortfallItems = plan.items.filter(i => !i.isStockSufficient);
          const progress = plan.totalApplications > 0 ? (plan.completedApplications / plan.totalApplications) * 100 : 0;
          const daysLeft = Math.max(0, Math.ceil((new Date(plan.endDate).getTime() - Date.now()) / 86400000));
          return (
            <Card key={plan.id} className={`hover:shadow-md transition-shadow cursor-pointer ${shortfallItems.length > 0 ? 'border-amber-300' : ''}`} onClick={() => setSelectedPlan(plan)}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base leading-tight">{plan.planName}</CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[plan.status]}`}>{plan.status}</span>
                      <span className="text-xs text-muted-foreground">{plan.farmZone} · {CYCLE_LABELS[plan.cycle]}</span>
                    </div>
                  </div>
                  {shortfallItems.length > 0 && <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-1" />}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Progress */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{plan.completedApplications} of {plan.totalApplications} applications done</span>
                    <span className="font-medium">{Math.round(progress)}%</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>

                {/* Dates */}
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span><CalendarDays className="w-3 h-3 inline mr-1" />{new Date(plan.startDate).toLocaleDateString()} → {new Date(plan.endDate).toLocaleDateString()}</span>
                  {daysLeft > 0 && plan.status === 'active' && <span className="text-blue-600">{daysLeft} days left</span>}
                </div>

                {/* Items */}
                <div className="space-y-1">
                  {plan.items.map(item => (
                    <div key={item.itemId} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{item.itemName}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{formatQuantity(item.totalPlannedQtyInStockUom ?? item.totalPlannedQty, item.uom)} needed</span>
                        {item.isStockSufficient
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                          : <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Shortfall warning */}
                {shortfallItems.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700">
                    ⚠ Insufficient stock for: {shortfallItems.map(i => i.itemName).join(', ')}
                  </div>
                )}

                {plan.status === 'active' && (
                  <Button size="sm" variant="outline" className="w-full text-xs h-7" onClick={(e) => { e.stopPropagation(); markApplicationComplete(plan.id); }}>
                    <Target className="w-3 h-3 mr-1" /> Mark Application Complete
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-2 text-center py-12 text-muted-foreground border rounded-xl">
            <FlaskConical className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>No plans found. Create your first spray plan to get stock sufficiency alerts.</p>
          </div>
        )}
      </div>

      {/* Plan Detail Modal */}
      {selectedPlan && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                {selectedPlan.planName}
                <button onClick={() => setSelectedPlan(null)}><X className="w-4 h-4" /></button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                {[
                  ['Zone', selectedPlan.farmZone],
                  ['Cycle', CYCLE_LABELS[selectedPlan.cycle]],
                  ['Status', selectedPlan.status],
                  ['Start', new Date(selectedPlan.startDate).toLocaleDateString()],
                  ['End', new Date(selectedPlan.endDate).toLocaleDateString()],
                  ['Progress', `${selectedPlan.completedApplications}/${selectedPlan.totalApplications} applications`],
                ].map(([l, v]) => (
                  <div key={l}>
                    <p className="text-xs text-muted-foreground">{l}</p>
                    <p className="font-medium">{v}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-sm font-semibold mb-2">Planned Chemicals</p>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="text-left px-3 py-2">Item</th>
                        <th className="text-right px-3 py-2">Per App</th>
                        <th className="text-right px-3 py-2">Total Needed</th>
                        <th className="text-right px-3 py-2">In Stock</th>
                        <th className="text-center px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPlan.items.map(item => (
                        <tr key={item.itemId} className={`border-t ${!item.isStockSufficient ? 'bg-amber-50' : ''}`}>
                          <td className="px-3 py-2">
                            <p>{item.itemName}</p>
                            <p className="text-xs text-muted-foreground capitalize">{item.category}</p>
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {formatQuantity(item.quantityPerApplication, item.requestedUom ?? item.uom)}
                            {(item.requestedUom ?? item.uom) !== item.uom && <p className="text-[10px] text-muted-foreground">= {formatQuantity(item.quantityPerApplicationInStockUom ?? item.quantityPerApplication, item.uom)}</p>}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold">{formatQuantity(item.totalPlannedQtyInStockUom ?? item.totalPlannedQty, item.uom)}</td>
                          <td className={`px-3 py-2 text-right font-mono ${item.isStockSufficient ? 'text-green-600' : 'text-red-600'}`}>{formatQuantity(item.currentStockAtPlanTime, item.uom)}</td>
                          <td className="px-3 py-2 text-center">
                            {item.isStockSufficient
                              ? <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                              : <AlertTriangle className="w-4 h-4 text-amber-500 mx-auto" />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedPlan.items.some(i => !i.isStockSufficient) && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="font-semibold text-amber-800 mb-1">⚠ Restock Alert</p>
                  {selectedPlan.items.filter(i => !i.isStockSufficient).map(item => (
                    <div key={item.itemId} className="text-sm text-amber-700">
                      <p>{item.itemName}: need {formatQuantity(item.shortfallQty ?? Math.max(0, (item.totalPlannedQtyInStockUom ?? item.totalPlannedQty) - item.currentStockAtPlanTime), item.uom)} more</p>
                      {item.projectedShortfallDate && <p className="text-xs">Stock will run out around <strong>{new Date(item.projectedShortfallDate).toLocaleDateString()}</strong>. Restock by <strong>{item.restockAlertDate ? new Date(item.restockAlertDate).toLocaleDateString() : 'as soon as possible'}</strong></p>}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setSelectedPlan(null)}>Close</Button>
                {selectedPlan.status === 'active' && (
                  <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => { markApplicationComplete(selectedPlan.id); setSelectedPlan(null); }}>
                    <Target className="w-4 h-4 mr-1" /> Log Application
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* New Plan Modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Create Spray Plan <button onClick={() => setShowNew(false)}><X className="w-4 h-4" /></button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-sm font-medium">Plan Name *</label>
                  <Input className="mt-1" placeholder="e.g. Banana Block A - Weekly Fungicide" value={newPlan.planName || ''} onChange={e => setNewPlan(p => ({ ...p, planName: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Farm Zone</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={newPlan.farmZone} onChange={e => setNewPlan(p => ({ ...p, farmZone: e.target.value as FarmZone }))}>
                    {farmZones.map(z => <option key={z} value={z}>{z}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Application Cycle</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={newPlan.cycle} onChange={e => setNewPlan(p => ({ ...p, cycle: e.target.value as any }))}>
                    {Object.entries(CYCLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Start Date *</label>
                  <Input type="date" className="mt-1" value={newPlan.startDate || ''} onChange={e => setNewPlan(p => ({ ...p, startDate: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">End Date *</label>
                  <Input type="date" className="mt-1" value={newPlan.endDate || ''} onChange={e => setNewPlan(p => ({ ...p, endDate: e.target.value }))} />
                </div>
                {newPlan.startDate && newPlan.endDate && (
                  <div className="col-span-2 bg-blue-50 border border-blue-200 rounded-lg p-2 text-xs text-blue-700">
                    → {getCycleApplications(newPlan.cycle || 'weekly', newPlan.startDate, newPlan.endDate)} application{getCycleApplications(newPlan.cycle || 'weekly', newPlan.startDate, newPlan.endDate) > 1 ? 's' : ''} planned
                  </div>
                )}
                <div className="col-span-2">
                  <label className="text-sm font-medium">Notes</label>
                  <Input className="mt-1" placeholder="e.g. Monday + Thursday applications" value={newPlan.notes || ''} onChange={e => setNewPlan(p => ({ ...p, notes: e.target.value }))} />
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold mb-2">Add Chemicals</p>
                <div className="flex flex-wrap gap-2">
                  <select className="flex-1 border rounded-md px-3 py-2 text-sm bg-background" value={newPlanItem.itemId} onChange={e => setNewPlanItem(p => ({ ...p, itemId: e.target.value }))}>
                    <option value="">Select chemical...</option>
                    {inventory.filter(i => i.isActive && i.category !== 'equipment').map(i => (
                      <option key={i.id} value={i.id}>{i.name} ({i.currentStock} {i.uom} in stock)</option>
                    ))}
                  </select>
                  <Input type="number" className="w-28" placeholder="Qty/app" step="0.1" value={newPlanItem.qtyPerApp || ''} onChange={e => setNewPlanItem(p => ({ ...p, qtyPerApp: parseFloat(e.target.value) || 0 }))} />
                  <select
                    className="w-24 border rounded-md px-2 py-2 text-sm bg-background"
                    value={newPlanItem.uom ?? inventory.find(i => i.id === newPlanItem.itemId)?.uom ?? 'lt'}
                    onChange={e => setNewPlanItem(p => ({ ...p, uom: e.target.value as UOM }))}
                  >
                    {(inventory.find(i => i.id === newPlanItem.itemId) ? compatibleUnits(inventory.find(i => i.id === newPlanItem.itemId)!.uom) : ['lt', 'ml', 'kg', 'g', 'units'] as UOM[]).map(uom => <option key={uom} value={uom}>{uom}</option>)}
                  </select>
                  <Button variant="outline" onClick={addPlanItem} disabled={!newPlanItem.itemId || !newPlanItem.qtyPerApp}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {newPlanItem.itemId && newPlanItem.qtyPerApp > 0 && (() => {
                  const item = inventory.find(i => i.id === newPlanItem.itemId);
                  if (!item) return null;
                  const requestedUom = newPlanItem.uom ?? item.uom;
                  const stockQty = convertQuantity(newPlanItem.qtyPerApp, requestedUom, item.uom);
                  const apps = newPlan.startDate && newPlan.endDate ? getCycleApplications(newPlan.cycle || 'weekly', newPlan.startDate, newPlan.endDate) : 1;
                  const total = stockQty * apps;
                  const shortfall = Math.max(0, total - item.currentStock);
                  return (
                    <div className={`mt-2 rounded-lg border p-2 text-xs ${shortfall > 0 ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-green-200 bg-green-50 text-green-800'}`}>
                      {formatQuantity(newPlanItem.qtyPerApp, requestedUom)} per application converts to {formatQuantity(stockQty, item.uom)} from stock. Total needed: {formatQuantity(total, item.uom)}. {shortfall > 0 ? `Short by ${formatQuantity(shortfall, item.uom)}.` : 'Stock is enough for this plan.'}
                    </div>
                  );
                })()}
              </div>

              {(newPlan.items || []).length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="text-left px-3 py-2">Item</th>
                        <th className="text-right px-3 py-2">Per App</th>
                        <th className="text-right px-3 py-2">Total</th>
                        <th className="text-right px-3 py-2">In Stock</th>
                        <th className="text-center px-3 py-2">OK?</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(newPlan.items || []).map((item, i) => (
                        <tr key={i} className={`border-t ${!item.isStockSufficient ? 'bg-amber-50' : ''}`}>
                          <td className="px-3 py-2">{item.itemName}</td>
                          <td className="px-3 py-2 text-right font-mono">{formatQuantity(item.quantityPerApplication, item.requestedUom ?? item.uom)}</td>
                          <td className="px-3 py-2 text-right font-mono font-semibold">{formatQuantity(item.totalPlannedQtyInStockUom ?? item.totalPlannedQty, item.uom)}</td>
                          <td className={`px-3 py-2 text-right font-mono ${item.isStockSufficient ? 'text-green-600' : 'text-red-600'}`}>{formatQuantity(item.currentStockAtPlanTime, item.uom)}</td>
                          <td className="px-3 py-2 text-center">{item.isStockSufficient ? '✓' : '⚠'}</td>
                          <td className="px-3 py-2">
                            <button onClick={() => setNewPlan(p => ({ ...p, items: (p.items || []).filter((_, j) => j !== i) }))} className="text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowNew(false)}>Cancel</Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={submitPlan} disabled={!newPlan.planName || !newPlan.startDate || !newPlan.endDate || !(newPlan.items || []).length}>
                  Create Plan
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
