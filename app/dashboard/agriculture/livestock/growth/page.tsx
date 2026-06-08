'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X, Download, TrendingUp } from 'lucide-react';
import type { WeightRecord } from '@/lib/agric/livestock-types';
import { useAppStore } from '@/lib/store';
import { useLivestock } from '@/lib/agric/useLivestock';

const today = new Date().toISOString().slice(0, 10);

export default function GrowthPage() {
  const { user } = useAppStore();
  const { weights: records, flocks, addRecord } = useLivestock();
  const growableFlocks = flocks.filter(f => f.status === 'active' && f.species !== 'chicken_layer' && f.purpose !== 'egg_production');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    flockHerdId: '',
    date: today,
    sampleSize: 10,
    avgWeightKg: 0,
    minWeightKg: 0,
    maxWeightKg: 0,
    fcr: 0,
    notes: '',
  });

  async function submit() {
    const flock = growableFlocks.find(f => f.id === form.flockHerdId);
    if (!flock || !form.avgWeightKg) return;
    const rec: WeightRecord = {
      id: `wt_${Date.now()}`,
      flockHerdId: flock.id,
      flockHerdName: flock.name,
      date: form.date,
      sampleSize: form.sampleSize,
      avgWeightKg: form.avgWeightKg,
      minWeightKg: form.minWeightKg || undefined,
      maxWeightKg: form.maxWeightKg || undefined,
      targetWeightKg: flock.targetWeight,
      fcr: form.fcr || undefined,
      recordedBy: user?.name ?? 'Farm Manager',
      notes: form.notes || undefined,
    };
    await addRecord('weight', rec);
    setShowForm(false);
    setForm({
      flockHerdId: growableFlocks[0]?.id ?? '',
      date: today, sampleSize: 10, avgWeightKg: 0,
      minWeightKg: 0, maxWeightKg: 0, fcr: 0, notes: '',
    });
  }

  function exportCSV() {
    const rows = [
      ['Date', 'Flock/Herd', 'Sample Size', 'Avg Weight (kg)', 'Min', 'Max', 'Target', 'FCR', 'Progress %', 'Recorded By'],
      ...records.map(r => [
        r.date, r.flockHerdName, r.sampleSize, r.avgWeightKg,
        r.minWeightKg ?? '', r.maxWeightKg ?? '',
        r.targetWeightKg ?? '',
        r.fcr ?? '',
        r.targetWeightKg ? ((r.avgWeightKg / r.targetWeightKg) * 100).toFixed(1) : '',
        r.recordedBy,
      ]),
    ];
    const a = document.createElement('a');
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(rows.map(r => r.join(',')).join('\n'))}`;
    a.download = `growth-records-${today}.csv`;
    a.click();
  }

  // Group records by flock for mini charts
  const byFlock = growableFlocks.map(flock => ({
    flock,
    records: records.filter(r => r.flockHerdId === flock.id).sort((a, b) => a.date.localeCompare(b.date)),
  })).filter(g => g.records.length > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">⚖️ Growth & Weight Tracking</h1>
          <p className="text-muted-foreground text-sm">Monitor live weight, FCR, and market-readiness for all meat species</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-4 h-4 mr-1" /> Export</Button>
          <Button className="bg-blue-700 hover:bg-blue-800" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-1" /> Record Weight
          </Button>
        </div>
      </div>

      {/* Per-Flock Growth Cards */}
      {byFlock.map(({ flock, records: flockRecords }) => {
        const latest = flockRecords[flockRecords.length - 1];
        const prev   = flockRecords[flockRecords.length - 2];
        const progress = flock.targetWeight
          ? Math.min(100, Math.round((latest.avgWeightKg / flock.targetWeight) * 100))
          : null;
        const weeklyGain = prev
          ? (latest.avgWeightKg - prev.avgWeightKg).toFixed(2)
          : null;
        const daysToTarget = flock.targetWeight && weeklyGain && parseFloat(weeklyGain) > 0
          ? Math.ceil(((flock.targetWeight - latest.avgWeightKg) / parseFloat(weeklyGain)) * 7)
          : null;

        return (
          <Card key={flock.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <span>{flock.name}</span>
                {progress !== null && (
                  <span className={`text-sm font-semibold ${progress >= 90 ? 'text-green-600' : progress >= 70 ? 'text-amber-600' : 'text-blue-600'}`}>
                    {progress}% to target
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[
                  { label: 'Current Avg', value: `${latest.avgWeightKg} kg` },
                  { label: 'Target Weight', value: flock.targetWeight ? `${flock.targetWeight} kg` : '—' },
                  { label: 'Weekly Gain', value: weeklyGain ? `+${weeklyGain} kg` : '—' },
                  { label: 'Est. Days to Market', value: daysToTarget ? `${daysToTarget} days` : '—' },
                ].map(s => (
                  <div key={s.label} className="bg-muted/30 rounded-lg p-2.5 text-center">
                    <p className="text-lg font-bold">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Weight progress bar */}
              {progress !== null && (
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>0 kg</span>
                    <span>{latest.avgWeightKg} kg current</span>
                    <span>{flock.targetWeight} kg target</span>
                  </div>
                  <div className="h-3 bg-secondary rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${progress >= 90 ? 'bg-green-500' : progress >= 70 ? 'bg-amber-500' : 'bg-blue-500'}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Mini weight trend chart */}
              {flockRecords.length > 1 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Weight trend</p>
                  <div className="flex items-end gap-1 h-10">
                    {flockRecords.map((r, i) => {
                      const maxW = Math.max(...flockRecords.map(x => x.avgWeightKg));
                      const h = (r.avgWeightKg / maxW) * 36;
                      const isLatest = i === flockRecords.length - 1;
                      return (
                        <div key={r.id} className="flex-1 flex flex-col items-center justify-end" title={`${r.date}: ${r.avgWeightKg}kg`}>
                          <div
                            className={`w-full rounded-t-sm ${isLatest ? 'bg-blue-600' : 'bg-blue-300'}`}
                            style={{ height: `${h}px` }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>{flockRecords[0].date}</span>
                    <span>Today</span>
                  </div>
                </div>
              )}

              {/* FCR info */}
              {latest.fcr && (
                <div className={`mt-3 text-xs rounded-lg px-3 py-1.5 inline-flex items-center gap-1 ${latest.fcr <= 1.8 ? 'bg-green-50 text-green-700' : latest.fcr <= 2.5 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                  <TrendingUp className="w-3 h-3" />
                  FCR: {latest.fcr} {latest.fcr <= 1.8 ? '✓ Excellent' : latest.fcr <= 2.5 ? '— Average' : '⚠ Poor'}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Full Table */}
      <Card>
        <CardHeader className="py-4">
          <CardTitle className="text-base">All Weight Records</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b">
                <tr>
                  {['Date', 'Flock / Herd', 'Sample', 'Avg Weight', 'Min', 'Max', 'Target', 'Progress', 'FCR', 'Notes', 'By'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {records.map((r, i) => {
                  const prog = r.targetWeightKg
                    ? Math.round((r.avgWeightKg / r.targetWeightKg) * 100)
                    : null;
                  return (
                    <tr key={r.id} className={`hover:bg-muted/30 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                      <td className="px-3 py-2 font-mono text-xs">{r.date}</td>
                      <td className="px-3 py-2 text-xs font-medium max-w-[140px] truncate">{r.flockHerdName.split('—')[0].trim()}</td>
                      <td className="px-3 py-2 text-center">{r.sampleSize}</td>
                      <td className="px-3 py-2 font-bold">{r.avgWeightKg} kg</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.minWeightKg ?? '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.maxWeightKg ?? '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.targetWeightKg ?? '—'} kg</td>
                      <td className="px-3 py-2">
                        {prog !== null && (
                          <div className="flex items-center gap-1">
                            <div className="w-12 h-1.5 bg-secondary rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${prog >= 90 ? 'bg-green-500' : prog >= 70 ? 'bg-amber-500' : 'bg-blue-500'}`}
                                style={{ width: `${prog}%` }} />
                            </div>
                            <span className="text-xs">{prog}%</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.fcr ? (
                          <span className={`font-medium ${r.fcr <= 1.8 ? 'text-green-600' : r.fcr <= 2.5 ? 'text-amber-600' : 'text-red-500'}`}>
                            {r.fcr}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-xs max-w-[120px] truncate">{r.notes ?? '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">{r.recordedBy}</td>
                    </tr>
                  );
                })}
                {records.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-3 py-10 text-center text-muted-foreground">No weight records yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                ⚖️ Record Weight <button onClick={() => setShowForm(false)}><X className="w-4 h-4" /></button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase">Flock / Herd *</label>
                <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={form.flockHerdId}
                  onChange={e => setForm(f => ({ ...f, flockHerdId: e.target.value }))}>
                  <option value="">Select flock or herd</option>{growableFlocks.map(fl => <option key={fl.id} value={fl.id}>{fl.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Date</label>
                  <Input type="date" className="mt-1" value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Sample Size</label>
                  <Input type="number" className="mt-1" value={form.sampleSize}
                    onChange={e => setForm(f => ({ ...f, sampleSize: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Avg Weight (kg) *</label>
                  <Input type="number" step="0.01" className="mt-1" value={form.avgWeightKg || ''}
                    onChange={e => setForm(f => ({ ...f, avgWeightKg: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Min Weight (kg)</label>
                  <Input type="number" step="0.01" className="mt-1" value={form.minWeightKg || ''}
                    onChange={e => setForm(f => ({ ...f, minWeightKg: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">Max Weight (kg)</label>
                  <Input type="number" step="0.01" className="mt-1" value={form.maxWeightKg || ''}
                    onChange={e => setForm(f => ({ ...f, maxWeightKg: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase">FCR (kg feed / kg gain)</label>
                  <Input type="number" step="0.01" className="mt-1" placeholder="e.g. 1.8"
                    value={form.fcr || ''}
                    onChange={e => setForm(f => ({ ...f, fcr: parseFloat(e.target.value) || 0 }))} />
                </div>
              </div>
              {form.avgWeightKg > 0 && form.flockHerdId && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-xs text-blue-800">
                  {(() => {
                    const fl = growableFlocks.find(f => f.id === form.flockHerdId);
                    if (!fl?.targetWeight) return null;
                    const prog = Math.round((form.avgWeightKg / fl.targetWeight) * 100);
                    const rem = (fl.targetWeight - form.avgWeightKg).toFixed(2);
                    return <p>Progress: <strong>{prog}%</strong> of target · <strong>{rem}kg</strong> remaining</p>;
                  })()}
                </div>
              )}
              <Input placeholder="Notes..." value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button className="flex-1 bg-blue-700 hover:bg-blue-800" onClick={submit}
                  disabled={!form.avgWeightKg}>Save Record</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
