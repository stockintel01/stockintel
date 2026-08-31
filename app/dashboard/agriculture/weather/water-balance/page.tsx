'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarClock, Download, Droplets, FileSpreadsheet, Pencil, Plus, Save, Upload, Wifi, CloudOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { userHasAccess } from '@/lib/access-permissions';
import { getAgricultureProfile } from '@/lib/agric/config';
import { addWaterRecord, addWaterRecords, subscribeWaterRecords, updateWaterRecord } from '@/lib/agric/water-service';
import { calculateWaterBalance, createWaterImportTemplateCsv, parseWaterImport, projectNextIrrigation, type WaterForecastDay, type WaterRecord, type WaterRecordInput } from '@/lib/agric/water-balance';
import { useAppStore } from '@/lib/store';

const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = (sectorName = '', plotName = '', cropName = ''): WaterRecordInput => ({ date: today(), sectorName, plotName, cropName, rainfallMm: 0, et0Mm: 0, cropCoefficient: 1, irrigationMm: 0, effectiveRainfallPercent: 80, irrigationEfficiencyPercent: 85, triggerDeficitMm: 25, notes: '' });
const recordKey = (record: WaterRecordInput) => `${record.date}|${record.sectorName.trim().toLocaleLowerCase()}|${record.plotName.trim().toLocaleLowerCase()}|${record.cropName.trim().toLocaleLowerCase()}`;

export default function WaterBalancePage() {
  const { organization, user } = useAppStore();
  const profile = getAgricultureProfile(organization?.settings);
  const canRecord = userHasAccess(user, 'agricWeather');
  const canImport = canRecord && ['owner', 'manager', 'super_admin'].includes(user?.role ?? '');
  const [records, setRecords] = useState<WaterRecord[]>([]);
  const [form, setForm] = useState<WaterRecordInput>(() => emptyForm(profile.location?.name ?? 'Main Farm', profile.farmZones[0] ?? '', profile.cropTypes[0] ?? ''));
  const [editingId, setEditingId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [message, setMessage] = useState('');
  const [forecast, setForecast] = useState<WaterForecastDay[]>([]);
  const [filterPlot, setFilterPlot] = useState('all');

  useEffect(() => {
    if (!organization?.id) return;
    return subscribeWaterRecords(organization.id, (items, hasPending) => { setRecords(items); setPending(hasPending); }, () => setMessage('Water records could not be loaded. Check access permissions and connectivity.'));
  }, [organization?.id]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

  useEffect(() => {
    const location = profile.location ?? profile.locations[0];
    if (!location) return;
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(location.latitude)); url.searchParams.set('longitude', String(location.longitude)); url.searchParams.set('timezone', location.timezone ?? 'auto');
    url.searchParams.set('daily', 'precipitation_sum,et0_fao_evapotranspiration'); url.searchParams.set('forecast_days', '7');
    fetch(url).then(response => response.ok ? response.json() : Promise.reject(new Error('Forecast unavailable'))).then((data: { daily?: { time?: string[]; precipitation_sum?: number[]; et0_fao_evapotranspiration?: number[] } }) => {
      setForecast((data.daily?.time ?? []).map((date, index) => ({ date, rainfallMm: data.daily?.precipitation_sum?.[index] ?? 0, et0Mm: data.daily?.et0_fao_evapotranspiration?.[index] ?? 0 })));
    }).catch(() => setForecast([]));
  }, [profile.location, profile.locations]);

  const balanceRows = useMemo(() => calculateWaterBalance(records), [records]);
  const plots = Array.from(new Set([...profile.farmZones, ...records.map(record => record.plotName)].filter(Boolean))).sort();
  const visibleRows = balanceRows.filter(row => filterPlot === 'all' || row.plotName === filterPlot).slice().reverse();
  const latestRows = Array.from(balanceRows.reduce((map, row) => map.set(`${row.sectorName}|${row.plotName}|${row.cropName}`, row), new Map<string, (typeof balanceRows)[number]>()).values()).filter(row => filterPlot === 'all' || row.plotName === filterPlot);

  function setNumber(field: keyof WaterRecordInput, value: string) { setForm(current => ({ ...current, [field]: value === '' ? 0 : Number(value) })); }
  function validate(input: WaterRecordInput) {
    if (!input.date || !input.sectorName.trim() || !input.plotName.trim() || !input.cropName.trim()) return 'Date, sector, plot and crop are required.';
    if ([input.rainfallMm, input.et0Mm, input.irrigationMm].some(value => !Number.isFinite(value) || value < 0)) return 'Rainfall, ET0 and irrigation must be non-negative numbers.';
    if (input.cropCoefficient <= 0 || input.cropCoefficient > 2) return 'Crop coefficient must be greater than 0 and no more than 2.';
    if (input.effectiveRainfallPercent < 0 || input.effectiveRainfallPercent > 100 || input.irrigationEfficiencyPercent <= 0 || input.irrigationEfficiencyPercent > 100) return 'Percentages must be between 0 and 100.';
    if (input.triggerDeficitMm <= 0) return 'Irrigation trigger must be greater than zero.';
    return '';
  }

  async function saveRecord() {
    if (!organization?.id || !user || !canRecord) return;
    const issue = validate(form); if (issue) return setMessage(issue);
    if (!editingId && records.some(record => recordKey(record) === recordKey(form))) return setMessage('This crop and plot already have a water record for that date. Edit the existing record instead.');
    setSaving(true);
    try {
      if (editingId) await updateWaterRecord(organization.id, editingId, form);
      else await addWaterRecord(organization.id, form, { id: user.id, name: user.name });
      setMessage(online ? 'Daily water record saved.' : 'Saved offline and queued for automatic synchronization.');
      setEditingId(''); setShowForm(false); setForm(emptyForm(form.sectorName, form.plotName, form.cropName));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Water record could not be saved.'); }
    finally { setSaving(false); }
  }

  function editRecord(record: WaterRecord) {
    setEditingId(record.id); setForm({ date: record.date, sectorName: record.sectorName, plotName: record.plotName, cropName: record.cropName, rainfallMm: record.rainfallMm, et0Mm: record.et0Mm, cropCoefficient: record.cropCoefficient, irrigationMm: record.irrigationMm, effectiveRainfallPercent: record.effectiveRainfallPercent, irrigationEfficiencyPercent: record.irrigationEfficiencyPercent, triggerDeficitMm: record.triggerDeficitMm, notes: record.notes ?? '' }); setShowForm(true);
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([createWaterImportTemplateCsv()], { type: 'text/csv;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'rainfall-irrigation-import-template.csv'; anchor.click(); URL.revokeObjectURL(url);
  }

  async function importRecords(file: File) {
    if (!organization?.id || !user || !canImport) return;
    setMessage('Checking rainfall and irrigation file...');
    try {
      const result = await parseWaterImport(file); const existing = new Set(records.map(recordKey)); const accepted: WaterRecordInput[] = [];
      result.records.forEach(record => { const key = recordKey(record); if (!existing.has(key)) { existing.add(key); accepted.push(record); } });
      const duplicates = result.records.length - accepted.length;
      if (accepted.length) await addWaterRecords(organization.id, accepted, { id: user.id, name: user.name });
      setMessage(`${accepted.length} daily record${accepted.length === 1 ? '' : 's'} imported. ${duplicates} duplicate${duplicates === 1 ? '' : 's'} skipped. ${result.errors.length} row${result.errors.length === 1 ? '' : 's'} required correction.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The import could not be completed.'); }
  }

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><Link href="/dashboard/agriculture/weather" className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 h-4 w-4" />Weather forecast</Link><h1 className="text-2xl font-bold sm:text-3xl">Rainfall & Irrigation</h1><p className="max-w-3xl text-sm text-muted-foreground">Record measured rainfall and crop water demand, carry deficits forward, and identify when irrigation is likely to be needed.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={downloadTemplate}><Download className="mr-2 h-4 w-4" />Import template</Button>{canImport && <label className="inline-flex h-10 cursor-pointer items-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent"><Upload className="mr-2 h-4 w-4" />Import CSV/XLSX<input type="file" accept=".csv,.xlsx" className="sr-only" onChange={event => { const file = event.target.files?.[0]; if (file) void importRecords(file); event.target.value = ''; }} /></label>}{canRecord && <Button onClick={() => { setEditingId(''); setForm(emptyForm(profile.location?.name ?? 'Main Farm', plots[0] ?? '', profile.cropTypes[0] ?? '')); setShowForm(true); }}><Plus className="mr-2 h-4 w-4" />Daily record</Button>}</div></div>
    <div className="flex gap-2 text-xs"><Badge variant="outline">{online ? <Wifi className="mr-1 h-3 w-3 text-green-600" /> : <CloudOff className="mr-1 h-3 w-3 text-amber-600" />}{online ? 'Online' : 'Offline'}</Badge>{pending && <Badge variant="outline">Waiting to sync</Badge>}</div>
    {message && <div className="rounded-lg border bg-muted/40 p-3 text-sm">{message}</div>}

    {showForm && <Card><CardHeader><CardTitle className="text-base">{editingId ? 'Edit daily water record' : 'Add daily water record'}</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{([['date', 'Date', 'date'], ['sectorName', 'Sector', 'text'], ['plotName', 'Plot', 'text'], ['cropName', 'Crop', 'text']] as const).map(([field, label, type]) => <div key={field} className="space-y-1.5"><Label>{label}</Label><Input type={type} value={String(form[field])} onChange={event => setForm(current => ({ ...current, [field]: event.target.value }))} /></div>)}{([['rainfallMm', 'Measured rainfall (mm)'], ['et0Mm', 'Reference ET0 / evaporation (mm)'], ['cropCoefficient', 'Crop coefficient (Kc)'], ['irrigationMm', 'Irrigation applied (mm)'], ['effectiveRainfallPercent', 'Effective rainfall (%)'], ['irrigationEfficiencyPercent', 'Irrigation efficiency (%)'], ['triggerDeficitMm', 'Irrigation trigger deficit (mm)']] as const).map(([field, label]) => <div key={field} className="space-y-1.5"><Label>{label}</Label><Input type="number" min={0} step="0.1" value={form[field]} onChange={event => setNumber(field, event.target.value)} /></div>)}</div><div className="space-y-1.5"><Label>Notes</Label><Input value={form.notes ?? ''} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} placeholder="Rain gauge, irrigation event, field condition or data source" /></div><div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">Crop demand = ET0 × Kc. Effective rainfall and applied irrigation reduce the running deficit. Set the trigger with your agronomist based on crop stage, soil water capacity and root depth.</div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button><Button disabled={saving} onClick={() => void saveRecord()}><Save className="mr-2 h-4 w-4" />{saving ? 'Saving...' : 'Save record'}</Button></div></CardContent></Card>}

    <div className="flex flex-wrap items-end gap-3"><div className="space-y-1.5"><Label>View plot</Label><select className="h-10 min-w-52 rounded-md border bg-background px-3 text-sm" value={filterPlot} onChange={event => setFilterPlot(event.target.value)}><option value="all">All plots</option>{plots.map(plot => <option key={plot} value={plot}>{plot}</option>)}</select></div><Badge variant="outline">{visibleRows.length} daily records</Badge></div>

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{latestRows.map(row => { const projection = projectNextIrrigation(row, forecast); return <Card key={`${row.sectorName}|${row.plotName}|${row.cropName}`} className={row.irrigationDue ? 'border-amber-300' : ''}><CardHeader className="pb-2"><CardTitle className="text-base">{row.plotName} · {row.cropName}</CardTitle><p className="text-xs text-muted-foreground">{row.sectorName} · through {row.date}</p></CardHeader><CardContent className="space-y-3"><div className="grid grid-cols-2 gap-3"><div><p className="text-xs text-muted-foreground">Current deficit</p><p className="text-2xl font-bold">{row.runningDeficitMm.toFixed(1)} mm</p></div><div><p className="text-xs text-muted-foreground">Trigger</p><p className="text-2xl font-bold">{row.triggerDeficitMm.toFixed(1)} mm</p></div></div><div className={`rounded-lg p-3 text-sm ${row.irrigationDue ? 'bg-amber-50 text-amber-900' : 'bg-green-50 text-green-900'}`}><p className="font-semibold">{row.irrigationDue ? `Irrigation due: apply about ${row.recommendedGrossIrrigationMm.toFixed(1)} mm` : projection.dueDate ? `Projected irrigation: ${projection.dueDate}` : 'No trigger within the available forecast'}</p><p className="mt-1 text-xs">{projection.dueDate ? `${projection.daysUntilDue === 0 ? 'Due today' : `Approximately ${projection.daysUntilDue} day${projection.daysUntilDue === 1 ? '' : 's'} away`} using forecast rain and ET0.` : `Projected deficit after ${forecast.length || 0} forecast days: ${projection.projectedDeficitMm.toFixed(1)} mm.`}</p></div></CardContent></Card>; })}</div>
    {latestRows.length === 0 && <Card><CardContent className="py-12 text-center"><Droplets className="mx-auto mb-3 h-8 w-8 text-blue-500" /><p className="font-medium">No water balance yet</p><p className="text-sm text-muted-foreground">Add or import daily rainfall and ET0 records to begin irrigation planning.</p></CardContent></Card>}

    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4" />Daily water ledger</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead><tr>{['Date', 'Sector / plot', 'Crop', 'Rain', 'ET0', 'Crop demand', 'Effective rain', 'Irrigation', 'Deficit', 'Status', ''].map(label => <th key={label} className="border-b p-2 text-right first:text-left">{label}</th>)}</tr></thead><tbody>{visibleRows.map(row => <tr key={row.id}><td className="border-b p-2">{row.date}</td><td className="border-b p-2 text-right">{row.sectorName} / {row.plotName}</td><td className="border-b p-2 text-right">{row.cropName}</td><td className="border-b p-2 text-right">{row.rainfallMm.toFixed(1)}</td><td className="border-b p-2 text-right">{row.et0Mm.toFixed(1)}</td><td className="border-b p-2 text-right">{row.cropDemandMm.toFixed(1)}</td><td className="border-b p-2 text-right">{row.effectiveRainfallMm.toFixed(1)}</td><td className="border-b p-2 text-right">{row.irrigationMm.toFixed(1)}</td><td className="border-b p-2 text-right font-semibold">{row.runningDeficitMm.toFixed(1)} mm</td><td className="border-b p-2 text-right"><Badge variant="outline" className={row.irrigationDue ? 'text-amber-700' : 'text-green-700'}>{row.irrigationDue ? 'Due' : 'Monitor'}</Badge></td><td className="border-b p-2 text-right">{canRecord && (row.createdBy === user?.id || canImport) && <Button size="icon" variant="ghost" aria-label="Edit water record" onClick={() => editRecord(row)}><Pencil className="h-4 w-4" /></Button>}</td></tr>)}</tbody></table></div></CardContent></Card>
    <p className="text-xs text-muted-foreground"><FileSpreadsheet className="mr-1 inline h-3 w-3" />Planning estimates support field decisions; confirm irrigation triggers with crop stage, soil observations and local agronomic guidance.</p>
  </div>;
}
