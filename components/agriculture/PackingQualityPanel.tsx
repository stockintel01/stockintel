'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, History, RotateCcw, Save, Settings2, ShieldCheck, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { packingInspectionStatus } from '@/lib/agric/packing';
import type { PackingInspectionStatus, PackingQualityConfig, PackingQualityEvent, PackingQualityEventType, PackingRecord, PackingStation } from '@/lib/agric/types';

const DEFAULTS = {
  packageTypes: ['Export carton', 'Crate', 'Bag', 'Pallet'],
  packageSizes: ['Small', 'Medium', 'Large', 'Custom'],
  qualityGrades: ['Export Grade A', 'Grade B', 'Processing'],
  rejectionReasons: ['Damage', 'Underweight', 'Overripe', 'Underripe', 'Contamination', 'Incorrect packaging', 'Quality defect'],
};
const list = (value: string) => value.split(/[\n,]+/).map(item => item.trim()).filter(Boolean);
const statusText = (status?: PackingInspectionStatus) => (status || 'awaiting_inspection').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

interface Props {
  records: PackingRecord[];
  events: PackingQualityEvent[];
  config: PackingQualityConfig | null;
  stations: PackingStation[];
  userId: string;
  userName: string;
  canManage: boolean;
  onRecord: (event: Omit<PackingQualityEvent, 'id' | 'createdAt'>, status: PackingInspectionStatus) => Promise<void>;
  onSaveConfig: (config: Omit<PackingQualityConfig, 'id' | 'updatedAt'>) => Promise<void>;
}

export function PackingQualityPanel({ records, events, config, stations, userId, userName, canManage, onRecord, onSaveConfig }: Props) {
  const standards = config ?? { id: 'main', ...DEFAULTS };
  const [section, setSection] = useState<'queue' | 'audit' | 'standards'>('queue');
  const [selected, setSelected] = useState<PackingRecord | null>(null);
  const [mode, setMode] = useState<PackingQualityEventType>('inspection');
  const [accepted, setAccepted] = useState(0);
  const [rejected, setRejected] = useState(0);
  const [rework, setRework] = useState(0);
  const [packageType, setPackageType] = useState(standards.packageTypes[0] ?? 'Carton');
  const [packageSize, setPackageSize] = useState(standards.packageSizes[0] ?? 'Standard');
  const [grade, setGrade] = useState(standards.qualityGrades[0] ?? 'Grade A');
  const [lotNumber, setLotNumber] = useState('');
  const [palletId, setPalletId] = useState('');
  const [storageLocation, setStorageLocation] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [settings, setSettings] = useState(() => ({ packageTypes: standards.packageTypes.join(', '), packageSizes: standards.packageSizes.join(', '), qualityGrades: standards.qualityGrades.join(', '), rejectionReasons: standards.rejectionReasons.join(', ') }));

  useEffect(() => {
    if (!config) return;
    setSettings({ packageTypes: config.packageTypes.join(', '), packageSizes: config.packageSizes.join(', '), qualityGrades: config.qualityGrades.join(', '), rejectionReasons: config.rejectionReasons.join(', ') });
  }, [config]);

  const qualityRecords = records.filter(record => Boolean(record.inspectionStatus));
  const waiting = qualityRecords.filter(record => (record.inspectedBoxes ?? 0) < record.packedBoxes || (record.reworkBoxes ?? 0) > 0);
  const acceptedStock = qualityRecords.reduce((sum, record) => sum + (record.acceptedBoxes ?? 0), 0);
  const rejectedTotal = qualityRecords.reduce((sum, record) => sum + (record.rejectedBoxes ?? 0), 0);
  const openByStation = useMemo(() => stations.map(station => ({ station, count: waiting.filter(record => record.stationId === station.id).length })).filter(item => item.count), [stations, waiting]);

  function open(record: PackingRecord, eventType: PackingQualityEventType) {
    setSelected(record); setMode(eventType); setMessage('');
    setPackageType(record.packageType || standards.packageTypes[0] || 'Carton');
    setPackageSize(record.packageSize || standards.packageSizes[0] || 'Standard');
    setGrade(record.qualityGrade || standards.qualityGrades[0] || 'Grade A');
    setLotNumber(record.lotNumber || `LOT-${record.date.replaceAll('-', '')}-${record.id.slice(0, 6).toUpperCase()}`);
    setPalletId(record.palletId || ''); setStorageLocation(record.storageLocation || ''); setReason(''); setNotes('');
    if (eventType === 'correction') {
      setAccepted(record.acceptedBoxes ?? 0); setRejected(record.rejectedBoxes ?? 0); setRework(record.reworkBoxes ?? 0);
    } else { setAccepted(0); setRejected(0); setRework(0); }
  }

  async function submit() {
    if (!selected) return;
    const currentAccepted = selected.acceptedBoxes ?? 0;
    const currentRejected = selected.rejectedBoxes ?? 0;
    const currentRework = selected.reworkBoxes ?? 0;
    const currentInspected = selected.inspectedBoxes ?? 0;
    let acceptedDelta = accepted, rejectedDelta = rejected, reworkDelta = rework, inspectedDelta = accepted + rejected + rework;
    if (mode === 'rework_resolution') {
      if (accepted + rejected <= 0 || accepted + rejected > currentRework) return setMessage(`Resolve between 1 and ${currentRework} rework boxes.`);
      reworkDelta = -(accepted + rejected); inspectedDelta = 0;
    } else if (mode === 'correction') {
      if (accepted < 0 || rejected < 0 || rework < 0 || accepted + rejected + rework > selected.packedBoxes) return setMessage('Corrected totals must be non-negative and cannot exceed packed boxes.');
      acceptedDelta = accepted - currentAccepted; rejectedDelta = rejected - currentRejected; reworkDelta = rework - currentRework;
      inspectedDelta = accepted + rejected + rework - currentInspected;
      if (acceptedDelta === 0 && rejectedDelta === 0 && reworkDelta === 0) return setMessage('Change at least one quality total before saving a correction.');
    } else {
      const remaining = selected.packedBoxes - currentInspected;
      if (inspectedDelta <= 0 || inspectedDelta > remaining) return setMessage(`Inspect between 1 and ${remaining} awaiting boxes.`);
    }
    if (!packageType.trim() || !grade.trim() || !lotNumber.trim()) return setMessage('Package type, quality grade and lot number are required.');
    if (currentInspected > 0 && (
      packageType.trim() !== selected.packageType
      || packageSize.trim() !== (selected.packageSize || '')
      || grade.trim() !== selected.qualityGrade
      || lotNumber.trim() !== selected.lotNumber
      || palletId.trim() !== (selected.palletId || '')
      || storageLocation.trim() !== (selected.storageLocation || '')
    )) return setMessage('Traceability details are locked after the first inspection. Record a separate packing session for a different lot, grade, package, pallet, or storage location.');
    if ((rejectedDelta > 0 || reworkDelta > 0 || mode === 'correction') && reason.trim().length < 3) return setMessage('Select or enter a reason for rejected, rework or corrected quantities.');
    const projected = { packedBoxes: selected.packedBoxes, inspectedBoxes: currentInspected + inspectedDelta, acceptedBoxes: currentAccepted + acceptedDelta, rejectedBoxes: currentRejected + rejectedDelta, reworkBoxes: currentRework + reworkDelta };
    const status = packingInspectionStatus(projected);
    setSaving(true); setMessage('');
    try {
      await onRecord({ packingRecordId: selected.id, eventType: mode, stationId: selected.stationId, stationName: selected.stationName, produce: selected.produce, packageType: packageType.trim(), packageSize: packageSize.trim() || undefined, qualityGrade: grade.trim(), lotNumber: lotNumber.trim(), palletId: palletId.trim() || undefined, storageLocation: storageLocation.trim() || undefined, inspectedDelta, acceptedDelta, rejectedDelta, reworkDelta, reason: reason.trim() || undefined, notes: notes.trim() || undefined, inspectorId: userId, inspectorName: userName, inspectedAt: new Date().toISOString() }, status);
      setSelected(null); setMessage(mode === 'correction' ? 'Audited correction saved.' : 'Quality decision saved. Accepted stock is now available for dispatch.');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Quality inspection could not be saved.'); }
    finally { setSaving(false); }
  }

  async function saveStandards() {
    const value = { packageTypes: list(settings.packageTypes), packageSizes: list(settings.packageSizes), qualityGrades: list(settings.qualityGrades), rejectionReasons: list(settings.rejectionReasons) };
    if (!value.packageTypes.length || !value.qualityGrades.length || !value.rejectionReasons.length) return setMessage('Keep at least one package type, grade and rejection reason.');
    setSaving(true); try { await onSaveConfig(value); setMessage('Quality standards saved.'); } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Standards could not be saved.'); } finally { setSaving(false); }
  }

  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Card><CardContent className="p-4"><p className="text-2xl font-bold">{waiting.length}</p><p className="text-xs text-muted-foreground">Awaiting action</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-2xl font-bold text-green-700">{acceptedStock}</p><p className="text-xs text-muted-foreground">Accepted boxes recorded</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-2xl font-bold text-amber-700">{qualityRecords.reduce((sum, item) => sum + (item.reworkBoxes ?? 0), 0)}</p><p className="text-xs text-muted-foreground">In rework</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-2xl font-bold text-red-700">{rejectedTotal}</p><p className="text-xs text-muted-foreground">Rejected boxes</p></CardContent></Card></div>
    <div className="flex gap-1 overflow-x-auto border-b">{([['queue', 'Inspection queue', ClipboardCheck], ['audit', 'Quality audit', History], ...(canManage ? [['standards', 'Standards', Settings2] as const] : [])] as const).map(([id, label, Icon]) => <button key={id} onClick={() => setSection(id)} className={`inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold ${section === id ? 'border-green-700 text-green-700' : 'border-transparent text-muted-foreground'}`}><Icon className="h-4 w-4" />{label}</button>)}</div>
    {message && <div className="rounded-lg border bg-muted/40 p-3 text-sm">{message}</div>}
    {section === 'queue' && <div className="space-y-3">{openByStation.length > 0 && <p className="text-xs text-muted-foreground">{openByStation.map(item => `${item.station.name}: ${item.count}`).join(' · ')}</p>}{waiting.map(record => { const remaining = record.packedBoxes - (record.inspectedBoxes ?? 0); return <Card key={record.id}><CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2"><Badge variant="outline">{statusText(record.inspectionStatus)}</Badge><Badge variant="secondary">{record.produce}</Badge></div><p className="mt-2 font-semibold">{record.stationName} · {record.date}</p><p className="text-xs text-muted-foreground">{record.packedBoxes} packed · {record.acceptedBoxes ?? 0} accepted · {record.reworkBoxes ?? 0} rework · {record.rejectedBoxes ?? 0} rejected</p>{record.lotNumber && <p className="text-xs text-muted-foreground">Lot {record.lotNumber}{record.palletId ? ` · Pallet ${record.palletId}` : ''}</p>}</div><div className="flex flex-wrap gap-2">{remaining > 0 && <Button size="sm" onClick={() => open(record, 'inspection')}><ClipboardCheck className="mr-2 h-4 w-4" />Inspect {remaining}</Button>}{(record.reworkBoxes ?? 0) > 0 && <Button size="sm" variant="outline" onClick={() => open(record, 'rework_resolution')}><RotateCcw className="mr-2 h-4 w-4" />Resolve rework</Button>}{canManage && <Button size="sm" variant="ghost" onClick={() => open(record, 'correction')}>Correct</Button>}</div></CardContent></Card>})}{waiting.length === 0 && <Card><CardContent className="py-12 text-center"><CheckCircle2 className="mx-auto mb-3 h-9 w-9 text-green-600" /><p className="font-semibold">Quality queue is clear</p><p className="text-sm text-muted-foreground">New packing sessions will wait here until inspected.</p></CardContent></Card>}</div>}
    {section === 'audit' && <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" />Append-only quality history</CardTitle></CardHeader><CardContent className="space-y-2">{events.map(event => <div key={event.id} className="rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{event.stationName} · {event.produce}</p><Badge variant="outline">{event.eventType.replaceAll('_', ' ')}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{new Date(event.inspectedAt).toLocaleString()} · {event.inspectorName} · Lot {event.lotNumber}</p><p className="mt-1 text-sm"><span className="text-green-700">Accepted {event.acceptedDelta >= 0 ? '+' : ''}{event.acceptedDelta}</span> · <span className="text-amber-700">Rework {event.reworkDelta >= 0 ? '+' : ''}{event.reworkDelta}</span> · <span className="text-red-700">Rejected {event.rejectedDelta >= 0 ? '+' : ''}{event.rejectedDelta}</span></p>{event.reason && <p className="text-xs text-muted-foreground">Reason: {event.reason}</p>}</div>)}{events.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No quality events recorded yet.</p>}</CardContent></Card>}
    {section === 'standards' && canManage && <Card><CardHeader><CardTitle className="text-base">Packhouse quality standards</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">Separate options with commas. These lists keep inspection entry fast and consistent while remaining tenant-specific.</p><div className="grid gap-3 md:grid-cols-2">{([['packageTypes', 'Package types'], ['packageSizes', 'Package sizes'], ['qualityGrades', 'Quality grades'], ['rejectionReasons', 'Rejection / rework reasons']] as const).map(([key, label]) => <div key={key}><Label>{label}</Label><Input className="mt-1" value={settings[key]} onChange={event => setSettings(current => ({ ...current, [key]: event.target.value }))} /></div>)}</div><div className="flex justify-end"><Button disabled={saving} onClick={() => void saveStandards()}><Save className="mr-2 h-4 w-4" />Save standards</Button></div></CardContent></Card>}

    {selected && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-3" role="dialog" aria-modal="true"><Card className="max-h-[92vh] w-full max-w-3xl overflow-y-auto"><CardHeader><CardTitle className="flex items-center justify-between">{mode === 'correction' ? 'Correct quality totals' : mode === 'rework_resolution' ? 'Resolve rework' : 'Inspect packed boxes'}<button aria-label="Close inspection" onClick={() => setSelected(null)}><X className="h-5 w-5" /></button></CardTitle></CardHeader><CardContent className="space-y-4"><div className="rounded-lg border bg-muted/40 p-3 text-sm">{selected.stationName} · {selected.produce} · {selected.packedBoxes} packed boxes</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{([['packageType', 'Package type', packageType, setPackageType, standards.packageTypes], ['packageSize', 'Package size', packageSize, setPackageSize, standards.packageSizes], ['grade', 'Quality grade', grade, setGrade, standards.qualityGrades]] as const).map(([, label, value, setter, options]) => <div key={label}><Label>{label}</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={value} onChange={event => setter(event.target.value)}>{options.map(option => <option key={option}>{option}</option>)}</select></div>)}<div><Label>Lot number *</Label><Input className="mt-1" value={lotNumber} onChange={event => setLotNumber(event.target.value)} /></div><div><Label>Pallet ID</Label><Input className="mt-1" value={palletId} onChange={event => setPalletId(event.target.value)} /></div><div><Label>Storage location</Label><Input className="mt-1" value={storageLocation} onChange={event => setStorageLocation(event.target.value)} /></div><div><Label>{mode === 'correction' ? 'Final accepted' : 'Accept'}</Label><Input className="mt-1" type="number" min="0" value={accepted || ''} onChange={event => setAccepted(Number(event.target.value) || 0)} /></div><div><Label>{mode === 'correction' ? 'Final rework' : 'Send to rework'}</Label><Input className="mt-1" type="number" min="0" value={rework || ''} onChange={event => setRework(Number(event.target.value) || 0)} disabled={mode === 'rework_resolution'} /></div><div><Label>{mode === 'correction' ? 'Final rejected' : 'Reject'}</Label><Input className="mt-1" type="number" min="0" value={rejected || ''} onChange={event => setRejected(Number(event.target.value) || 0)} /></div><div className="sm:col-span-2"><Label>Reason</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={reason} onChange={event => setReason(event.target.value)}><option value="">No rejection or rework</option>{standards.rejectionReasons.map(option => <option key={option}>{option}</option>)}</select></div><div><Label>Inspection notes</Label><Input className="mt-1" value={notes} onChange={event => setNotes(event.target.value)} /></div></div>{message && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</div>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button><Button disabled={saving} onClick={() => void submit()}><ShieldCheck className="mr-2 h-4 w-4" />{saving ? 'Saving...' : 'Save quality decision'}</Button></div></CardContent></Card></div>}
  </div>;
}
