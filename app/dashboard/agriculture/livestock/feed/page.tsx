'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X, Download, AlertTriangle } from 'lucide-react';
import type { FeedConsumptionLog, LivestockFeedPlan } from '@/lib/agric/livestock-types';
import { useAppStore } from '@/lib/store';
import { useLivestock } from '@/lib/agric/useLivestock';
import { useAgric } from '@/lib/agric/useAgric';
import { canConvertItemQuantity, convertItemQuantity, formatQuantity } from '@/lib/agric/units';

const today = new Date().toISOString().slice(0, 10);

export default function LivestockFeedPage() {
  const { user } = useAppStore();
  const { feedLogs: logs, feedPlans: plans, flocks, addRecord } = useLivestock();
  const { inventory } = useAgric();
  const feedInventory = inventory.filter(item => item.category === 'other' && item.isActive);
  const [tab, setTab]     = useState<'daily' | 'plans' | 'inventory'>('daily');
  const [showForm, setShowForm] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [form, setForm] = useState({
    flockHerdId: '',
    feedItemId: '',
    quantityKg: 0, feedsPerDay: 2, date: today, notes: '',
  });

  const todayLogs = logs.filter(l => l.date === today);
  const todayFeedKg = todayLogs.reduce((s, l) => s + l.quantityKg, 0);
  const todayFeedCost = todayLogs.reduce((s, l) => s + (l.totalCost ?? 0), 0);

  // Low-stock feed items
  const lowFeedItems = feedInventory.filter(i =>
    i.isActive && i.currentStock <= i.minimumStock
  );

  // Feed plans with shortfall
  const shortfallPlans = plans.filter(p => !p.isStockSufficient && p.status === 'active');
  const selectedFeed = feedInventory.find(item => item.id === form.feedItemId);
  const requestedStockQuantity = selectedFeed && form.quantityKg > 0 && canConvertItemQuantity('kg', selectedFeed.uom, selectedFeed.packSize)
    ? convertItemQuantity(form.quantityKg, 'kg', selectedFeed.uom, selectedFeed.packSize)
    : null;
  const hasEnoughFeed = requestedStockQuantity !== null && selectedFeed
    ? selectedFeed.currentStock >= requestedStockQuantity
    : true;

  async function submitLog() {
    const flock = flocks.find(f => f.id === form.flockHerdId);
    const feed  = feedInventory.find(i => i.id === form.feedItemId);
    if (!flock || !feed || !form.quantityKg) return;
    setSubmitError(null);
    if (!canConvertItemQuantity('kg', feed.uom, feed.packSize)) {
      setSubmitError(`This item is stocked in ${feed.uom}. Add a pack size or use a weight unit before logging feed.`);
      return;
    }
    const quantityInStockUom = convertItemQuantity(form.quantityKg, 'kg', feed.uom, feed.packSize);
    if (feed.currentStock < quantityInStockUom) {
      setSubmitError(`Only ${formatQuantity(feed.currentStock, feed.uom)} is available; this entry requires ${formatQuantity(quantityInStockUom, feed.uom)}.`);
      return;
    }
    const rec: FeedConsumptionLog = {
      id: `fc_${Date.now()}`,
      flockHerdId: flock.id, flockHerdName: flock.name,
      species: flock.species as any,
      date: form.date,
      feedItemId: feed.id, feedItemName: feed.name,
      feedCategory: 'layer_mash',
      quantityKg: form.quantityKg,
      feedsPerDay: form.feedsPerDay,
      animalCount: flock.currentCount,
      costPerKg: quantityInStockUom > 0 ? ((quantityInStockUom * (feed.unitCost ?? 0)) / form.quantityKg) : 0,
      totalCost: quantityInStockUom * (feed.unitCost ?? 0),
      recordedBy: user?.name ?? 'Farm Manager',
      notes: form.notes || undefined,
    };
    try {
      await addRecord('feedLog', rec);
      setShowForm(false);
      setForm({ flockHerdId: flocks[0]?.id ?? '', feedItemId: feedInventory[0]?.id ?? '', quantityKg: 0, feedsPerDay: 2, date: today, notes: '' });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to save this feed log.');
    }
  }

  function exportCSV() {
    const rows = [
      ['Date', 'Flock/Herd', 'Species', 'Feed', 'Qty (kg)', 'Feeds/Day', 'Animals', 'FCR', 'Cost', 'By'],
      ...logs.map(l => [l.date, l.flockHerdName, l.species, l.feedItemName, l.quantityKg, l.feedsPerDay, l.animalCount, l.feedConversionRatio ?? '', l.totalCost ?? '', l.recordedBy]),
    ];
    const a = document.createElement('a');
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(rows.map(r => r.join(',')).join('\n'))}`;
    a.download = `feed-log-${today}.csv`; a.click();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🌾 Feed Management</h1>
          <p className="text-muted-foreground text-sm">Daily consumption · Feed plans · Inventory · FCR tracking</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-4 h-4 mr-1" /> Export</Button>
          <Button className="bg-green-700 hover:bg-green-800" onClick={() => { setSubmitError(null); setShowForm(true); }}><Plus className="w-4 h-4 mr-1" /> Log Feed</Button>
        </div>
      </div>

      {/* Alerts */}
      {(lowFeedItems.length > 0 || shortfallPlans.length > 0) && (
        <div className="space-y-2">
          {lowFeedItems.map(item => (
            <div key={item.id} className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-3 text-sm">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <p className="text-red-800"><strong>{item.name}</strong> — Stock at {item.currentStock}{item.uom}, minimum is {item.minimumStock}{item.uom}. Reorder immediately.</p>
            </div>
          ))}
          {shortfallPlans.map(p => (
            <div key={p.id} className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <p className="text-amber-800"><strong>{p.name}</strong> — Insufficient stock for full plan. Need {p.totalFeedRequired}kg, have {p.currentStockAtPlanTime}kg. Shortfall on ~{p.projectedShortfallDate}.</p>
            </div>
          ))}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Feed Today',    value: `${todayFeedKg.toLocaleString()} kg`,    color: 'border-l-green-500' },
          { label: 'Feed Cost Today', value: `GHS ${todayFeedCost.toFixed(0)}`,      color: 'border-l-blue-500' },
          { label: 'Flocks Fed',    value: `${todayLogs.length}`,                   color: 'border-l-amber-500' },
        ].map(k => (
          <Card key={k.label} className={`border-l-4 ${k.color}`}>
            <CardContent className="pt-3 pb-3">
              <p className="text-2xl font-bold">{k.value}</p>
              <p className="text-xs text-muted-foreground">{k.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {[['daily', '📋 Daily Log'], ['plans', '📅 Feed Plans'], ['inventory', '📦 Feed Stock']].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === v ? 'border-green-600 text-green-700' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{l}</button>
        ))}
      </div>

      {/* Daily Log */}
      {tab === 'daily' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b">
                  <tr>
                    {['Date', 'Flock / Herd', 'Species', 'Feed', 'Qty (kg)', 'Feeds/Day', 'FCR', 'Cost (GHS)', 'g/Animal/Day', 'Recorded By'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logs.map((l, i) => {
                    const gPerAnimal = l.animalCount > 0 ? ((l.quantityKg * 1000) / l.animalCount / l.feedsPerDay).toFixed(0) : '—';
                    return (
                      <tr key={l.id} className={`hover:bg-muted/30 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                        <td className="px-3 py-2 font-mono text-xs">{l.date}</td>
                        <td className="px-3 py-2 font-medium text-xs max-w-[140px] truncate">{l.flockHerdName.split('—')[0].trim()}</td>
                        <td className="px-3 py-2 text-xs capitalize">{l.species.replace(/_/g, ' ')}</td>
                        <td className="px-3 py-2 text-xs">{l.feedItemName}</td>
                        <td className="px-3 py-2 font-bold">{l.quantityKg}</td>
                        <td className="px-3 py-2 text-center">{l.feedsPerDay}x</td>
                        <td className="px-3 py-2">
                          {l.feedConversionRatio ? (
                            <span className={`font-medium ${l.feedConversionRatio <= 1.8 ? 'text-green-600' : l.feedConversionRatio <= 2.5 ? 'text-amber-600' : 'text-red-500'}`}>
                              {l.feedConversionRatio}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2 font-medium">{l.totalCost ? l.totalCost.toFixed(2) : '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">{gPerAnimal}g</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{l.recordedBy}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Feed Plans */}
      {tab === 'plans' && (
        <div className="space-y-3">
          {plans.map(plan => {
            const progress = plan.durationDays > 0
              ? Math.min(100, Math.round((Math.ceil((Date.now() - new Date(plan.startDate).getTime()) / 86400000) / plan.durationDays) * 100))
              : 0;
            return (
              <Card key={plan.id} className={!plan.isStockSufficient ? 'border-amber-300' : ''}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">{plan.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{plan.flockHerdName} · Phase: {plan.phase}</p>
                      <div className="flex gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                        <span>Feed: {plan.feedItemName}</span>
                        <span>·</span>
                        <span>{plan.dailyRationKgPerAnimal * 1000}g/animal/day</span>
                        <span>·</span>
                        <span>Total needed: {plan.totalFeedRequired}kg</span>
                        <span>·</span>
                        <span className={!plan.isStockSufficient ? 'text-red-600 font-medium' : 'text-green-600'}>
                          In stock: {plan.currentStockAtPlanTime}kg {!plan.isStockSufficient ? '⚠' : '✓'}
                        </span>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${plan.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{plan.status}</span>
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>{plan.startDate}</span>
                      <span>{progress}% through plan</span>
                      <span>{plan.endDate}</span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  {!plan.isStockSufficient && plan.projectedShortfallDate && (
                    <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                      ⚠ Stock will run out ~{plan.projectedShortfallDate}. Order {(plan.totalFeedRequired - plan.currentStockAtPlanTime).toFixed(0)}kg additional feed.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Feed Inventory */}
      {tab === 'inventory' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b">
                  <tr>
                    {['Feed Item', 'In Stock', 'Min Stock', 'Avg/Week', 'Weeks Left', 'Unit Cost', 'Status'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {feedInventory.map(item => {
                    const weeksLeft = item.avgWeeklyUsage && item.avgWeeklyUsage > 0
                      ? (item.currentStock / item.avgWeeklyUsage).toFixed(1)
                      : '∞';
                    const isLow = item.currentStock <= item.minimumStock;
                    const isCritical = item.currentStock <= item.minimumStock * 0.5;
                    return (
                      <tr key={item.id} className={`hover:bg-muted/30 ${isCritical ? 'bg-red-50' : isLow ? 'bg-amber-50' : ''}`}>
                        <td className="px-3 py-2 font-medium">{item.name}</td>
                        <td className="px-3 py-2 font-bold">{item.currentStock.toLocaleString()} {item.uom}</td>
                        <td className="px-3 py-2 text-muted-foreground">{item.minimumStock} {item.uom}</td>
                        <td className="px-3 py-2 text-muted-foreground">{item.avgWeeklyUsage ?? '—'} {item.uom}</td>
                        <td className={`px-3 py-2 font-semibold ${parseFloat(weeksLeft as string) <= 1 ? 'text-red-600' : parseFloat(weeksLeft as string) <= 2 ? 'text-amber-600' : 'text-green-600'}`}>{weeksLeft} wks</td>
                        <td className="px-3 py-2 text-muted-foreground">GHS {item.unitCost?.toFixed(2) ?? '—'}/{item.uom}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isCritical ? 'bg-red-100 text-red-700' : isLow ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                            {isCritical ? 'Critical' : isLow ? 'Low' : 'OK'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Log Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">🌾 Log Feed Consumption <button onClick={() => setShowForm(false)}><X className="w-4 h-4" /></button></CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase">Flock / Herd *</label>
                <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={form.flockHerdId} onChange={e => setForm(f => ({ ...f, flockHerdId: e.target.value }))}>
                  <option value="">Select flock or herd</option>{flocks.filter(f => f.status === 'active').map(fl => <option key={fl.id} value={fl.id}>{fl.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase">Feed Item *</label>
                <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={form.feedItemId} onChange={e => setForm(f => ({ ...f, feedItemId: e.target.value }))}>
                  <option value="">Select feed inventory item</option>{feedInventory.map(i => <option key={i.id} value={i.id}>{i.name} ({i.currentStock}{i.uom} in stock)</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Quantity (kg) *</label>
                  <Input type="number" step="0.1" className="mt-1" value={form.quantityKg || ''} onChange={e => setForm(f => ({ ...f, quantityKg: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Feeds Per Day</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={form.feedsPerDay} onChange={e => setForm(f => ({ ...f, feedsPerDay: parseInt(e.target.value) }))}>
                    <option value={1}>1x / day</option><option value={2}>2x / day</option><option value={3}>3x / day</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Date</label>
                  <Input type="date" className="mt-1" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
              </div>
              {form.quantityKg > 0 && form.flockHerdId && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-xs text-green-800">
                  {(() => {
                    const fl = flocks.find(f => f.id === form.flockHerdId);
                    const fi = feedInventory.find(i => i.id === form.feedItemId);
                    if (!fl || !fi) return null;
                    const gPerAnimal = ((form.quantityKg * 1000) / fl.currentCount).toFixed(0);
                    if (!canConvertItemQuantity('kg', fi.uom, fi.packSize)) {
                      return <p className="text-red-700">This item cannot be converted from kg. Add its pack size in stock management.</p>;
                    }
                    const stockQty = convertItemQuantity(form.quantityKg, 'kg', fi.uom, fi.packSize);
                    const cost = stockQty * (fi.unitCost ?? 0);
                    return <p>→ <strong>{gPerAnimal}g/animal</strong> · Uses <strong>{formatQuantity(stockQty, fi.uom)}</strong> · Cost: <strong>GHS {cost.toFixed(2)}</strong>{stockQty > fi.currentStock ? <span className="text-red-700"> · Insufficient stock</span> : null}</p>;
                  })()}
                </div>
              )}
              {submitError && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{submitError}</p>}
              <Input className="mt-1" placeholder="Notes (optional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button className="flex-1 bg-green-700 hover:bg-green-800" onClick={submitLog} disabled={!form.quantityKg || !form.flockHerdId || !form.feedItemId || !hasEnoughFeed}>Save</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
