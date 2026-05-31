'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, Plus, ChevronRight, ArrowRight, Bell,
  Egg, Beef, Pill, Weight, BarChart3, Droplets,
  TrendingDown, TrendingUp, Loader2, X
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  MOCK_FLOCKS, MOCK_PENS, MOCK_EGG_RECORDS, MOCK_MORTALITY,
  MOCK_FEED_LOGS, MOCK_MILK_RECORDS, MOCK_LIVESTOCK_SALES,
  EGG_PRODUCTION_TREND, MOCK_EGG_SALES,
} from '@/lib/agric/livestock-mock-data';
import type { AnimalFlockHerd, PoultrySpecies, LivestockSpecies } from '@/lib/agric/livestock-types';

// ── Species config ────────────────────────────────────────────
const SPECIES_CONFIG: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
  chicken_layer:   { label: 'Layer Hens',    emoji: '🐓', color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200' },
  chicken_broiler: { label: 'Broilers',      emoji: '🐔', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
  chicken_cockerel:{ label: 'Cockerels',     emoji: '🐓', color: 'text-red-700',    bg: 'bg-red-50 border-red-100' },
  turkey:          { label: 'Turkeys',       emoji: '🦃', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
  duck:            { label: 'Ducks',         emoji: '🦆', color: 'text-teal-700',   bg: 'bg-teal-50 border-teal-200' },
  goose:           { label: 'Geese',         emoji: '🪿', color: 'text-green-700',  bg: 'bg-green-50 border-green-200' },
  guinea_fowl:     { label: 'Guinea Fowl',   emoji: '🐦', color: 'text-slate-700',  bg: 'bg-slate-50 border-slate-200' },
  quail:           { label: 'Quail',         emoji: '🐦', color: 'text-brown-700',  bg: 'bg-amber-50 border-amber-100' },
  cattle:          { label: 'Cattle',        emoji: '🐄', color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
  pig:             { label: 'Pigs',          emoji: '🐖', color: 'text-pink-700',   bg: 'bg-pink-50 border-pink-200' },
  sheep:           { label: 'Sheep',         emoji: '🐑', color: 'text-gray-700',   bg: 'bg-gray-50 border-gray-200' },
  goat:            { label: 'Goats',         emoji: '🐐', color: 'text-lime-700',   bg: 'bg-lime-50 border-lime-200' },
  rabbit:          { label: 'Rabbits',       emoji: '🐇', color: 'text-rose-700',   bg: 'bg-rose-50 border-rose-200' },
};

const PHASE_COLORS: Record<string, string> = {
  chick:     'bg-yellow-100 text-yellow-800',
  grower:    'bg-lime-100 text-lime-800',
  pre_lay:   'bg-blue-100 text-blue-800',
  peak_lay:  'bg-green-100 text-green-800',
  late_lay:  'bg-amber-100 text-amber-800',
  spent:     'bg-gray-100 text-gray-600',
};

function getSpecies(s: string) { return SPECIES_CONFIG[s] ?? { label: s, emoji: '🐾', color: 'text-gray-700', bg: 'bg-gray-50' }; }

function MortalityRate({ flock }: { flock: AnimalFlockHerd }) {
  const rate = flock.initialCount > 0
    ? (((flock.initialCount - flock.currentCount) / flock.initialCount) * 100).toFixed(1)
    : '0';
  const rateNum = parseFloat(rate);
  return (
    <span className={`text-xs font-medium ${rateNum > 5 ? 'text-red-600' : rateNum > 2 ? 'text-amber-600' : 'text-green-600'}`}>
      {rate}% mortality
    </span>
  );
}

export default function LivestockOverviewPage() {
  const [selectedFlock, setSelectedFlock] = useState<AnimalFlockHerd | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  // Today's eggs (all layer flocks)
  const todayEggs = MOCK_EGG_RECORDS
    .filter(r => r.date === today)
    .reduce((s, r) => s + r.totalEggsCollected, 0);

  const todayLayRate = MOCK_EGG_RECORDS.filter(r => r.date === today)?.[0]?.layRate ?? 0;

  // Today's feed cost
  const todayFeedCost = MOCK_FEED_LOGS
    .filter(r => r.date === today)
    .reduce((s, r) => s + (r.totalCost ?? 0), 0);

  // Today's milk
  const todayMilk = MOCK_MILK_RECORDS
    .filter(r => r.date === today)
    .reduce((s, r) => s + r.totalLitres, 0);

  // Today's mortality
  const todayMortality = MOCK_MORTALITY
    .filter(r => r.date === today)
    .reduce((s, r) => s + r.count, 0);

  // Total animals across all active flocks
  const totalAnimals = MOCK_FLOCKS
    .filter(f => f.status === 'active')
    .reduce((s, f) => s + f.currentCount, 0);

  // Group by species type
  const poultryFlocks = MOCK_FLOCKS.filter(f => f.status === 'active' &&
    ['chicken_layer','chicken_broiler','chicken_cockerel','turkey','duck','goose','guinea_fowl','quail','ostrich'].includes(f.species));
  const livestockFlocks = MOCK_FLOCKS.filter(f => f.status === 'active' &&
    ['cattle','pig','sheep','goat','rabbit','horse','donkey','camel'].includes(f.species));

  // Pending mortality alerts
  const mortalityAlerts = MOCK_MORTALITY.filter(m => m.vetVisitRequired && !m.vetVisitDate?.includes('past'));

  // 7-day avg lay rate
  const avgLayRate = (EGG_PRODUCTION_TREND.reduce((s, d) => s + d.layRate, 0) / EGG_PRODUCTION_TREND.length).toFixed(1);

  // Pen occupancy
  const penAlerts = MOCK_PENS.filter(p => p.currentOccupancy / p.capacity > 0.95);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            🐾 Livestock & Poultry
          </h1>
          <p className="text-muted-foreground text-sm">
            {MOCK_FLOCKS.filter(f => f.status === 'active').length} active flocks/herds ·{' '}
            {totalAnimals.toLocaleString()} total animals ·{' '}
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/agriculture/livestock/egg-production">
            <Button variant="outline" size="sm"><Egg className="w-4 h-4 mr-1" /> Egg Records</Button>
          </Link>
          <Link href="/dashboard/agriculture/livestock/feed">
            <Button variant="outline" size="sm">🌾 Feed Log</Button>
          </Link>
          <Button size="sm" className="bg-green-600 hover:bg-green-700">
            <Plus className="w-4 h-4 mr-1" /> New Flock / Herd
          </Button>
        </div>
      </div>

      {/* Mortality alerts */}
      {(todayMortality > 0 || mortalityAlerts.length > 0) && (
        <div className="space-y-2">
          {todayMortality > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <p className="font-semibold text-red-800">{todayMortality} animal{todayMortality > 1 ? 's' : ''} died today</p>
                <p className="text-sm text-red-700">{MOCK_MORTALITY.filter(m => m.date === today).map(m => `${m.count} ${getSpecies(m.species).label} (${m.reason.replace(/_/g, ' ')})`).join(' · ')}</p>
              </div>
              <Link href="/dashboard/agriculture/livestock/mortality">
                <Button size="sm" variant="outline" className="border-red-300 text-red-700 ml-auto">View Log</Button>
              </Link>
            </div>
          )}
          {mortalityAlerts.map(a => (
            <div key={a.id} className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3 text-sm">
              <Bell className="w-4 h-4 text-amber-600" />
              <p className="text-amber-800">Vet visit required: <strong>{a.flockName}</strong> — {a.symptoms?.slice(0, 80)}</p>
            </div>
          ))}
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Eggs Today',        value: todayEggs.toLocaleString(), sub: `${todayLayRate}% lay rate`, emoji: '🥚', color: 'border-l-amber-500' },
          { label: 'Milk Today',        value: `${todayMilk}L`,           sub: `${MOCK_MILK_RECORDS.filter(r=>r.date===today).length} milking sessions`, emoji: '🥛', color: 'border-l-blue-400' },
          { label: 'Feed Cost Today',   value: `GHS ${todayFeedCost.toFixed(0)}`, sub: 'All species combined', emoji: '🌾', color: 'border-l-green-500' },
          { label: 'Mortality Today',   value: todayMortality.toString(), sub: todayMortality > 0 ? 'Action required' : 'All clear', emoji: '📉', color: todayMortality > 0 ? 'border-l-red-500' : 'border-l-green-400' },
          { label: '7-Day Avg Lay Rate',value: `${avgLayRate}%`,          sub: 'Layer House A', emoji: '📊', color: 'border-l-purple-500' },
        ].map(k => (
          <Card key={k.label} className={`border-l-4 ${k.color}`}>
            <CardContent className="pt-3 pb-3">
              <p className="text-xl font-bold">{k.emoji} {k.value}</p>
              <p className="text-xs text-muted-foreground leading-tight">{k.label}</p>
              <p className="text-xs text-muted-foreground">{k.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Left 2/3: Flock cards */}
        <div className="md:col-span-2 space-y-4">
          {/* Poultry section */}
          {poultryFlocks.length > 0 && (
            <div>
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2">🐔 Poultry Operations</h2>
              <div className="space-y-3">
                {poultryFlocks.map(flock => {
                  const sp = getSpecies(flock.species);
                  const occupancy = flock.currentCount / flock.initialCount;
                  const isLayer = flock.species === 'chicken_layer';
                  const isBroiler = flock.species === 'chicken_broiler';
                  const daysToSlaughter = flock.expectedSlaughterDate
                    ? Math.ceil((new Date(flock.expectedSlaughterDate).getTime() - Date.now()) / 86400000)
                    : null;
                  const todayFlockEggs = isLayer ? MOCK_EGG_RECORDS.filter(e => e.flockId === flock.id && e.date === today).reduce((s, e) => s + e.totalEggsCollected, 0) : 0;

                  return (
                    <Card key={flock.id} className={`border cursor-pointer hover:shadow-md transition-shadow ${sp.bg}`} onClick={() => setSelectedFlock(flock)}>
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xl">{sp.emoji}</span>
                              <p className="font-semibold">{flock.name}</p>
                              {flock.productionPhase && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PHASE_COLORS[flock.productionPhase] ?? 'bg-gray-100 text-gray-700'}`}>
                                  {flock.productionPhase.replace(/_/g, ' ')}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                              <span>{sp.label}</span>
                              {flock.breed && <><span>·</span><span>{flock.breed}</span></>}
                              {flock.ageWeeks != null && <><span>·</span><span>{flock.ageWeeks} weeks old</span></>}
                              <span>·</span><MortalityRate flock={flock} />
                            </div>

                            {/* Population bar */}
                            <div className="mt-2">
                              <div className="flex justify-between text-xs mb-0.5">
                                <span className={`font-bold ${sp.color}`}>{flock.currentCount.toLocaleString()} birds</span>
                                <span className="text-muted-foreground">of {flock.initialCount.toLocaleString()}</span>
                              </div>
                              <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
                                <div className="h-full bg-current rounded-full" style={{ width: `${occupancy * 100}%`, color: occupancy > 0.95 ? '#16a34a' : occupancy > 0.85 ? '#d97706' : '#dc2626' }} />
                              </div>
                            </div>

                            {/* Layer-specific */}
                            {isLayer && (
                              <div className="flex gap-3 mt-2 text-xs">
                                <span className="bg-white/70 rounded px-2 py-0.5 font-medium">🥚 {todayFlockEggs.toLocaleString()} eggs today</span>
                                {MOCK_EGG_RECORDS.find(e => e.flockId === flock.id && e.date === today)?.layRate != null && (
                                  <span className="bg-white/70 rounded px-2 py-0.5 font-medium">📊 {MOCK_EGG_RECORDS.find(e => e.flockId === flock.id && e.date === today)?.layRate}% lay rate</span>
                                )}
                              </div>
                            )}

                            {/* Broiler-specific */}
                            {isBroiler && daysToSlaughter !== null && (
                              <div className="flex gap-3 mt-2 text-xs">
                                <span className={`rounded px-2 py-0.5 font-medium ${daysToSlaughter <= 7 ? 'bg-red-100 text-red-700' : daysToSlaughter <= 14 ? 'bg-amber-100 text-amber-700' : 'bg-white/70'}`}>
                                  🕐 {daysToSlaughter > 0 ? `${daysToSlaughter} days to slaughter` : 'Ready for slaughter'}
                                </span>
                                {flock.averageWeight && <span className="bg-white/70 rounded px-2 py-0.5 font-medium">⚖️ {flock.averageWeight}kg avg</span>}
                              </div>
                            )}
                          </div>
                          <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Livestock section */}
          {livestockFlocks.length > 0 && (
            <div>
              <h2 className="text-base font-semibold mb-3 flex items-center gap-2">🐄 Livestock Operations</h2>
              <div className="space-y-3">
                {livestockFlocks.map(flock => {
                  const sp = getSpecies(flock.species);
                  const isDairy = flock.purpose === 'dairy';
                  const todayMilkFlock = isDairy ? MOCK_MILK_RECORDS.filter(r => r.herdId === flock.id && r.date === today).reduce((s,r) => s + r.totalLitres, 0) : 0;
                  const daysToMarket = flock.expectedSlaughterDate
                    ? Math.ceil((new Date(flock.expectedSlaughterDate).getTime() - Date.now()) / 86400000)
                    : null;
                  const weightProgress = flock.averageWeight && flock.targetWeight
                    ? (flock.averageWeight / flock.targetWeight) * 100
                    : null;

                  return (
                    <Card key={flock.id} className={`border cursor-pointer hover:shadow-md transition-shadow ${sp.bg}`} onClick={() => setSelectedFlock(flock)}>
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xl">{sp.emoji}</span>
                              <p className="font-semibold">{flock.name}</p>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${sp.bg} ${sp.color}`}>
                                {flock.purpose.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                              <span>{sp.label}</span>
                              {flock.breed && <><span>·</span><span>{flock.breed}</span></>}
                              {flock.ageWeeks && <><span>·</span><span>{flock.ageWeeks} weeks</span></>}
                              <span>·</span><MortalityRate flock={flock} />
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              <span className={`font-bold ${sp.color}`}>{flock.currentCount} animals</span>
                              {flock.femaleCount != null && flock.maleCount != null && (
                                <span>({flock.femaleCount}♀ {flock.maleCount}♂)</span>
                              )}
                            </div>

                            {/* Dairy milk */}
                            {isDairy && todayMilkFlock > 0 && (
                              <div className="flex gap-2 mt-2 text-xs">
                                <span className="bg-white/70 rounded px-2 py-0.5 font-medium">🥛 {todayMilkFlock}L milk today</span>
                                <span className="bg-white/70 rounded px-2 py-0.5">{(todayMilkFlock / (flock.femaleCount ?? 1)).toFixed(1)}L avg/cow</span>
                              </div>
                            )}

                            {/* Weight progress */}
                            {weightProgress !== null && (
                              <div className="mt-2">
                                <div className="flex justify-between text-xs mb-0.5">
                                  <span>Weight progress</span>
                                  <span className="font-medium">{flock.averageWeight}kg / {flock.targetWeight}kg target</span>
                                </div>
                                <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${weightProgress >= 90 ? 'bg-green-500' : weightProgress >= 70 ? 'bg-amber-500' : 'bg-blue-400'}`} style={{ width: `${Math.min(weightProgress, 100)}%` }} />
                                </div>
                              </div>
                            )}

                            {daysToMarket !== null && daysToMarket >= 0 && (
                              <p className={`text-xs mt-1.5 font-medium ${daysToMarket <= 14 ? 'text-amber-700' : 'text-muted-foreground'}`}>
                                🕐 {daysToMarket} days to market
                              </p>
                            )}
                          </div>
                          <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Quick panels */}
        <div className="space-y-4">
          {/* Pen Occupancy */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Pen / House Occupancy</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {MOCK_PENS.filter(p => p.currentOccupancy > 0).map(pen => {
                const pct = Math.round((pen.currentOccupancy / pen.capacity) * 100);
                return (
                  <div key={pen.id} className="text-xs">
                    <div className="flex justify-between mb-0.5">
                      <span className="font-medium truncate">{pen.name}</span>
                      <span className={`ml-2 flex-shrink-0 ${pct >= 95 ? 'text-red-600 font-bold' : pct >= 80 ? 'text-amber-600' : 'text-muted-foreground'}`}>{pen.currentOccupancy}/{pen.capacity}</span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${pct >= 95 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-400' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* 7-Day Lay Rate Trend */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center justify-between">
                🥚 Lay Rate Trend
                <Link href="/dashboard/agriculture/livestock/egg-production">
                  <Button variant="ghost" size="sm" className="text-xs h-6">Details</Button>
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-end gap-1 h-14">
                {EGG_PRODUCTION_TREND.map((d, i) => {
                  const pct = (d.layRate / 100) * 100;
                  const isToday = i === EGG_PRODUCTION_TREND.length - 1;
                  return (
                    <div key={d.day} className="flex-1 flex flex-col items-center justify-end gap-0.5">
                      <div title={`${d.layRate}%`}
                        className={`w-full rounded-t-sm ${isToday ? 'bg-amber-500' : 'bg-amber-300'}`}
                        style={{ height: `${pct * 0.52}px` }} />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                <span>7 days ago</span><span>Today {todayLayRate}%</span>
              </div>
            </CardContent>
          </Card>

          {/* Recent Mortality */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center justify-between">
                📉 Recent Mortality
                <Link href="/dashboard/agriculture/livestock/mortality">
                  <Button variant="ghost" size="sm" className="text-xs h-6">Full Log</Button>
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              {MOCK_MORTALITY.slice(0, 4).map(m => (
                <div key={m.id} className="text-xs border rounded-lg p-2">
                  <div className="flex justify-between">
                    <span className="font-medium">{m.flockName.split('—')[0].trim()}</span>
                    <span className={`font-bold ${m.count >= 5 ? 'text-red-600' : 'text-amber-600'}`}>{m.count} dead</span>
                  </div>
                  <p className="text-muted-foreground truncate">{m.reason.replace(/_/g, ' ')} · {m.date}</p>
                  {m.vetVisitRequired && !m.vetVisitDate && <p className="text-red-600 font-medium mt-0.5">⚠ Vet visit pending</p>}
                </div>
              ))}
              {MOCK_MORTALITY.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No mortality records</p>}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader className="py-3"><CardTitle className="text-sm">Quick Actions</CardTitle></CardHeader>
            <CardContent className="pt-0 space-y-1">
              {[
                { label: 'Record Egg Collection', href: '/dashboard/agriculture/livestock/egg-production', emoji: '🥚' },
                { label: 'Log Feed Consumption', href: '/dashboard/agriculture/livestock/feed', emoji: '🌾' },
                { label: 'Record Mortality', href: '/dashboard/agriculture/livestock/mortality', emoji: '📉' },
                { label: 'Log Vaccination', href: '/dashboard/agriculture/livestock/health', emoji: '💉' },
                { label: 'Record Milk Production', href: '/dashboard/agriculture/livestock/milk', emoji: '🥛' },
                { label: 'Log Weight / Growth', href: '/dashboard/agriculture/livestock/growth', emoji: '⚖️' },
                { label: 'Livestock Reports', href: '/dashboard/agriculture/livestock/reports', emoji: '📊' },
              ].map(a => (
                <Link key={a.href} href={a.href}>
                  <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent transition-colors cursor-pointer group text-sm">
                    <span>{a.emoji}</span>
                    <span>{a.label}</span>
                    <ArrowRight className="w-3 h-3 ml-auto text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Flock Detail Modal */}
      {selectedFlock && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <span>{getSpecies(selectedFlock.species).emoji}</span>
                {selectedFlock.name}
              </CardTitle>
              <button onClick={() => setSelectedFlock(null)}><X className="w-4 h-4" /></button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ['Species', getSpecies(selectedFlock.species).label],
                  ['Breed', selectedFlock.breed ?? '—'],
                  ['Purpose', (selectedFlock.purpose ?? '').replace(/_/g, ' ')],
                  ['Pen / House', selectedFlock.penHouseName],
                  ['Current Count', selectedFlock.currentCount.toLocaleString()],
                  ['Initial Count', selectedFlock.initialCount.toLocaleString()],
                  ['Female / Male', selectedFlock.femaleCount != null ? `${selectedFlock.femaleCount}♀ / ${selectedFlock.maleCount ?? 0}♂` : '—'],
                  ['Age', selectedFlock.ageWeeks != null ? `${selectedFlock.ageWeeks} weeks` : '—'],
                  ['Placed On', selectedFlock.dateOfBirth ?? '—'],
                  ['Status', selectedFlock.status],
                  selectedFlock.productionPhase ? ['Production Phase', (selectedFlock.productionPhase ?? '').replace(/_/g, ' ')] : ['', ''],
                  selectedFlock.expectedSlaughterDate ? ['Slaughter/Market Date', selectedFlock.expectedSlaughterDate] : ['', ''],
                  selectedFlock.targetWeight ? ['Target Weight', `${selectedFlock.targetWeight}kg`] : ['', ''],
                  selectedFlock.averageWeight ? ['Current Avg Weight', `${selectedFlock.averageWeight}kg`] : ['', ''],
                ].filter(([l]) => l).map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="font-medium capitalize">{value}</p>
                  </div>
                ))}
              </div>
              {selectedFlock.notes && (
                <div className="bg-muted/40 rounded-lg p-3 text-sm">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p>{selectedFlock.notes}</p>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setSelectedFlock(null)}>Close</Button>
                <Link href={`/dashboard/agriculture/livestock/egg-production`} className="flex-1">
                  <Button className="w-full bg-green-600 hover:bg-green-700">
                    {selectedFlock.species === 'chicken_layer' ? '🥚 Egg Records' : selectedFlock.purpose === 'dairy' ? '🥛 Milk Records' : '⚖️ Growth Records'}
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
