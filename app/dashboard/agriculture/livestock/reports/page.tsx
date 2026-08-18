'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, BarChart3 } from 'lucide-react';
import { useLivestock } from '@/lib/agric/useLivestock';

const today = new Date().toISOString().slice(0, 10);
type Period = 'daily' | 'weekly' | 'monthly';

export default function LivestockReportsPage() {
  const {
    flocks: flocks, eggRecords: eggRecords, feedLogs: feedLogs,
    mortality: mortality, milkRecords: milkRecords,
    livestockSales: livestockSales, eggSales: eggSales,
  } = useLivestock();
  const EGG_PRODUCTION_TREND = [...eggRecords].sort((a, b) => a.date.localeCompare(b.date)).slice(-7).map(record => ({
    day: record.date, layRate: record.layRate ?? 0, eggs: record.totalEggsCollected, gradeA: record.gradeA,
  }));
  const [period, setPeriod] = useState<Period>('weekly');

  // Summary stats
  const totalAnimals = flocks.filter(f => f.status === 'active').reduce((s, f) => s + f.currentCount, 0);
  const totalEggs7d  = EGG_PRODUCTION_TREND.reduce((s, d) => s + d.eggs, 0);
  const avgLayRate   = (EGG_PRODUCTION_TREND.reduce((s, d) => s + d.layRate, 0) / EGG_PRODUCTION_TREND.length).toFixed(1);
  const totalMilk    = milkRecords.reduce((s, r) => s + r.totalLitres, 0);
  const totalMilkRev = milkRecords.reduce((s, r) => s + (r.revenue ?? 0), 0);
  const totalEggRev  = eggSales.reduce((s, r) => s + (r.totalRevenue ?? 0), 0);
  const totalLiveSalesRev = livestockSales.reduce((s, r) => s + (r.totalRevenue ?? 0), 0);
  const totalFeedCost = feedLogs.reduce((s, l) => s + (l.totalCost ?? 0), 0);
  const totalMortality = mortality.reduce((s, r) => s + r.count, 0);
  const mortalityRate = totalAnimals > 0 ? ((totalMortality / (totalAnimals + totalMortality)) * 100).toFixed(2) : '0';

  function exportReport() {
    const lines = [
      `LIVESTOCK & POULTRY REPORT — ${period.toUpperCase()}`,
      `Generated: ${new Date().toLocaleString()}`,
      ``,
      `=== POPULATION ===`,
      ...flocks.filter(f => f.status === 'active').map(f =>
        `${f.name}: ${f.currentCount} animals (initial: ${f.initialCount})`
      ),
      `Total Animals: ${totalAnimals}`,
      ``,
      `=== EGG PRODUCTION (7 days) ===`,
      `Total Eggs: ${totalEggs7d.toLocaleString()}`,
      `Average Lay Rate: ${avgLayRate}%`,
      `Total Trays: ${Math.floor(totalEggs7d / 30)}`,
      `Egg Revenue: GHS ${totalEggRev.toLocaleString()}`,
      ``,
      `=== MILK PRODUCTION ===`,
      `Total Milk: ${totalMilk}L`,
      `Rejected: ${milkRecords.reduce((s, r) => s + (r.rejected ?? 0), 0)}L`,
      `Revenue: GHS ${totalMilkRev.toLocaleString()}`,
      ``,
      `=== LIVESTOCK SALES ===`,
      ...livestockSales.map(s => `${s.date} — ${s.count} ${s.species} (${s.type}): GHS ${s.totalRevenue?.toLocaleString()}`),
      `Total Sales Revenue: GHS ${totalLiveSalesRev.toLocaleString()}`,
      ``,
      `=== FEED ===`,
      `Total Feed Cost (period): GHS ${totalFeedCost.toFixed(2)}`,
      ...feedLogs.map(l => `${l.date} — ${l.flockHerdName.split('—')[0].trim()}: ${l.quantityKg}kg ${l.feedItemName} @ GHS ${l.totalCost?.toFixed(2)}`),
      ``,
      `=== MORTALITY ===`,
      `Total Deaths: ${totalMortality}`,
      `Mortality Rate: ${mortalityRate}%`,
      ...mortality.map(m => `${m.date} — ${m.flockName.split('—')[0].trim()}: ${m.count} dead (${m.reason.replace(/_/g, ' ')})`),
      ``,
      `=== TOTAL REVENUE ===`,
      `Eggs:        GHS ${totalEggRev.toLocaleString()}`,
      `Milk:        GHS ${totalMilkRev.toLocaleString()}`,
      `Livestock:   GHS ${totalLiveSalesRev.toLocaleString()}`,
      `TOTAL:       GHS ${(totalEggRev + totalMilkRev + totalLiveSalesRev).toLocaleString()}`,
      ``,
      `=== COSTS ===`,
      `Feed:        GHS ${totalFeedCost.toFixed(2)}`,
      `NET (Revenue - Feed): GHS ${(totalEggRev + totalMilkRev + totalLiveSalesRev - totalFeedCost).toFixed(2)}`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `livestock-report-${period}-${today}.txt`;
    a.click();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-green-600" /> Livestock & Poultry Reports
          </h1>
          <p className="text-muted-foreground text-sm">Production, mortality, feed, revenue — all in one view</p>
        </div>
        <div className="flex gap-2">
          <div className="flex gap-1 border rounded-md p-1">
            {(['daily', 'weekly', 'monthly'] as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1 rounded text-sm capitalize transition-colors ${period === p ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{p}</button>
            ))}
          </div>
          <Button onClick={exportReport}><Download className="w-4 h-4 mr-1" /> Export</Button>
        </div>
      </div>

      {/* Report Banner */}
      <div className="bg-green-700 text-white rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-green-200 text-xs uppercase tracking-widest">Moonlight Fresco Ltd — Livestock Division</p>
          <h2 className="text-xl font-bold capitalize">{period} Report · {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</h2>
        </div>
        <div className="text-right text-sm text-green-200">Generated {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      </div>

      {/* Revenue Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Egg Revenue',       value: `GHS ${totalEggRev.toLocaleString()}`,           color: 'border-l-amber-500' },
          { label: 'Milk Revenue',      value: `GHS ${totalMilkRev.toLocaleString()}`,          color: 'border-l-blue-400' },
          { label: 'Livestock Sales',   value: `GHS ${totalLiveSalesRev.toLocaleString()}`,     color: 'border-l-green-500' },
          { label: 'Total Revenue',     value: `GHS ${(totalEggRev + totalMilkRev + totalLiveSalesRev).toLocaleString()}`, color: 'border-l-purple-500' },
        ].map(k => (
          <Card key={k.label} className={`border-l-4 ${k.color}`}>
            <CardContent className="pt-3 pb-3">
              <p className="text-xl font-bold">{k.value}</p>
              <p className="text-xs text-muted-foreground">{k.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Flock/Herd Population */}
        <Card>
          <CardHeader className="py-4"><CardTitle className="text-base">Flock & Herd Population</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b">
                <tr>
                  {['Name', 'Species', 'Current', 'Initial', 'Mortality %'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {flocks.filter(f => f.status === 'active').map(f => {
                  const mort = f.initialCount > 0 ? (((f.initialCount - f.currentCount) / f.initialCount) * 100).toFixed(1) : '0';
                  return (
                    <tr key={f.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium text-xs">{f.name.split('—')[0].trim()}</td>
                      <td className="px-3 py-2 text-xs capitalize text-muted-foreground">{f.species.replace(/_/g, ' ')}</td>
                      <td className="px-3 py-2 font-bold">{f.currentCount.toLocaleString()}</td>
                      <td className="px-3 py-2 text-muted-foreground">{f.initialCount.toLocaleString()}</td>
                      <td className={`px-3 py-2 font-medium ${parseFloat(mort) > 5 ? 'text-red-600' : parseFloat(mort) > 2 ? 'text-amber-600' : 'text-green-600'}`}>{mort}%</td>
                    </tr>
                  );
                })}
                <tr className="bg-muted/20 font-semibold">
                  <td colSpan={2} className="px-3 py-2 text-sm">Total</td>
                  <td className="px-3 py-2">{totalAnimals.toLocaleString()}</td>
                  <td className="px-3 py-2">{flocks.filter(f=>f.status==='active').reduce((s,f)=>s+f.initialCount,0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-amber-600">{mortalityRate}%</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Egg Production Summary */}
        <Card>
          <CardHeader className="py-4"><CardTitle className="text-base">🥚 Egg Production (7-Day)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { label: 'Total Eggs',     value: totalEggs7d.toLocaleString() },
                { label: 'Avg Lay Rate',   value: `${avgLayRate}%`             },
                { label: 'Total Trays',    value: Math.floor(totalEggs7d/30)   },
                { label: 'Total Crates',   value: Math.floor(totalEggs7d/360)  },
                { label: 'Grade A',        value: EGG_PRODUCTION_TREND.reduce((s,d)=>s+d.gradeA,0).toLocaleString() },
                { label: 'Revenue',        value: `GHS ${totalEggRev.toLocaleString()}` },
              ].map(s => (
                <div key={s.label} className="bg-amber-50 border border-amber-100 rounded-lg p-2.5">
                  <p className="font-bold text-amber-800">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Milk Summary */}
        <Card>
          <CardHeader className="py-4"><CardTitle className="text-base">🥛 Milk Production</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b">
                <tr>{['Date','Shift','Cows','Total (L)','Avg/Cow','Rejected','Revenue'].map(h=><th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {milkRecords.map(r=>(
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs">{r.date}</td>
                    <td className="px-3 py-2 text-xs capitalize">{r.shift}</td>
                    <td className="px-3 py-2 text-center">{r.activeMilkingCows}</td>
                    <td className="px-3 py-2 font-bold">{r.totalLitres}L</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.avgPerCow}L</td>
                    <td className={`px-3 py-2 ${(r.rejected??0)>0?'text-red-600':'text-muted-foreground'}`}>{r.rejected?`${r.rejected}L`:'—'}</td>
                    <td className="px-3 py-2 text-green-700">{r.revenue?`GHS ${r.revenue}`:'—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/20 border-t font-semibold text-sm">
                <tr>
                  <td colSpan={3} className="px-3 py-2">Total</td>
                  <td className="px-3 py-2">{totalMilk}L</td>
                  <td className="px-3 py-2">{(totalMilk / Math.max(1, milkRecords.length * 38)).toFixed(1)}L avg</td>
                  <td className="px-3 py-2 text-red-600">{milkRecords.reduce((s,r)=>s+(r.rejected??0),0)}L</td>
                  <td className="px-3 py-2 text-green-700">GHS {totalMilkRev.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>

        {/* Feed & Mortality */}
        <Card>
          <CardHeader className="py-4"><CardTitle className="text-base">🌾 Feed Cost & 📉 Mortality</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { label: 'Total Feed Cost',  value: `GHS ${totalFeedCost.toFixed(2)}`, color: 'bg-green-50 border-green-100' },
                { label: 'Total Deaths',     value: `${totalMortality} animals`,        color: 'bg-red-50 border-red-100' },
                { label: 'Mortality Rate',   value: `${mortalityRate}%`,               color: 'bg-amber-50 border-amber-100' },
                { label: 'Net Profit Est.',  value: `GHS ${(totalEggRev+totalMilkRev+totalLiveSalesRev-totalFeedCost).toFixed(0)}`, color: 'bg-purple-50 border-purple-100' },
              ].map(s => (
                <div key={s.label} className={`border rounded-lg p-2.5 ${s.color}`}>
                  <p className="font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="border rounded-lg p-3 space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Feed Breakdown</p>
              {feedLogs.map(l => (
                <div key={l.id} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{l.flockHerdName.split('—')[0].trim()} — {l.feedItemName.split('(')[0].trim()}</span>
                  <span className="font-medium">{l.quantityKg}kg · GHS {l.totalCost?.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="text-center text-xs text-muted-foreground border-t pt-4">
        Report generated by StockIntel Agri · Livestock & Poultry Division · © {new Date().getFullYear()}
      </div>
    </div>
  );
}

