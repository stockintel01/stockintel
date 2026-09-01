'use client';

import { useEffect, useMemo, useState } from 'react';
import { Archive, CheckCircle2, ClipboardCheck, ExternalLink, History, Plus, RotateCcw, Save, Settings2, ShieldCheck, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { packingInspectionStatus } from '@/lib/agric/packing';
import { matchingPackingStandards, packingMarketLabel, packingStandardCatalog, standardGradeNames } from '@/lib/agric/packing-standards';
import type { PackingCommodityStandard, PackingInspectionStatus, PackingMarket, PackingQualityConfig, PackingQualityEvent, PackingQualityEventType, PackingRecord, PackingStation } from '@/lib/agric/types';

const DEFAULTS = {
  packageTypes: ['Export carton', 'Crate', 'Bag', 'Pallet'],
  packageSizes: ['Small', 'Medium', 'Large', 'Custom'],
  qualityGrades: ['Export Grade A', 'Grade B', 'Processing'],
  rejectionReasons: ['Damage', 'Underweight', 'Overripe', 'Underripe', 'Contamination', 'Incorrect packaging', 'Quality defect'],
};
const list = (value: string) => value.split(/[\n,]+/).map(item => item.trim()).filter(Boolean);
const checks = (value: string) => value.split(/[\n;]+/).map(item => item.trim()).filter(Boolean);
const isWebUrl = (value?: string) => Boolean(value && /^https?:\/\//i.test(value));
const statusText = (status?: PackingInspectionStatus) => (status || 'awaiting_inspection').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

const EMPTY_STANDARD = {
  name: '', commodity: '', market: 'local' as PackingMarket, destinationCountries: '', authority: '', reference: '', version: '', sourceUrl: '',
  packageTypes: 'Crate, Carton', packageSizes: 'Customer specification', grades: 'Grade A, Grade B',
  rejectionReasons: 'Damage, Contamination, Incorrect maturity, Package or label nonconformance',
  requiredChecks: 'Produce meets the selected grade definition; Package and label meet the applicable market requirements',
};

interface Props {
  records: PackingRecord[];
  events: PackingQualityEvent[];
  config: PackingQualityConfig | null;
  stations: PackingStation[];
  userId: string;
  userName: string;
  canManage: boolean;
  produceTypes: string[];
  initialSection?: 'queue' | 'audit' | 'standards';
  shippedBoxesByRecord: ReadonlyMap<string, number>;
  onRecord: (event: Omit<PackingQualityEvent, 'id' | 'createdAt'>, status: PackingInspectionStatus) => Promise<void>;
  onSaveConfig: (config: Omit<PackingQualityConfig, 'id' | 'updatedAt'>) => Promise<void>;
}

export function PackingQualityPanel({ records, events, config, stations, userId, userName, canManage, produceTypes, initialSection = 'queue', shippedBoxesByRecord, onRecord, onSaveConfig }: Props) {
  const standards = config ?? { id: 'main', ...DEFAULTS };
  const [section, setSection] = useState<'queue' | 'audit' | 'standards'>(initialSection);
  const [selected, setSelected] = useState<PackingRecord | null>(null);
  const [mode, setMode] = useState<PackingQualityEventType>('inspection');
  const [accepted, setAccepted] = useState(0);
  const [rejected, setRejected] = useState(0);
  const [rework, setRework] = useState(0);
  const [packed, setPacked] = useState(0);
  const [packageType, setPackageType] = useState(standards.packageTypes[0] ?? 'Carton');
  const [packageSize, setPackageSize] = useState(standards.packageSizes[0] ?? 'Standard');
  const [grade, setGrade] = useState(standards.qualityGrades[0] ?? 'Grade A');
  const [lotNumber, setLotNumber] = useState('');
  const [palletId, setPalletId] = useState('');
  const [storageLocation, setStorageLocation] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [standardId, setStandardId] = useState('');
  const [confirmedChecks, setConfirmedChecks] = useState<string[]>([]);
  const [standardForm, setStandardForm] = useState(EMPTY_STANDARD);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [settings, setSettings] = useState(() => ({ packageTypes: standards.packageTypes.join(', '), packageSizes: standards.packageSizes.join(', '), qualityGrades: standards.qualityGrades.join(', '), rejectionReasons: standards.rejectionReasons.join(', ') }));

  useEffect(() => {
    if (!config) return;
    setSettings({ packageTypes: config.packageTypes.join(', '), packageSizes: config.packageSizes.join(', '), qualityGrades: config.qualityGrades.join(', '), rejectionReasons: config.rejectionReasons.join(', ') });
  }, [config]);

  useEffect(() => setSection(initialSection), [initialSection]);

  const qualityRecords = records.filter(record => Boolean(record.inspectionStatus));
  const waiting = qualityRecords.filter(record => (record.inspectedBoxes ?? 0) < record.packedBoxes || (record.reworkBoxes ?? 0) > 0);
  const acceptedStock = qualityRecords.reduce((sum, record) => sum + (record.acceptedBoxes ?? 0), 0);
  const rejectedTotal = qualityRecords.reduce((sum, record) => sum + (record.rejectedBoxes ?? 0), 0);
  const openByStation = useMemo(() => stations.map(station => ({ station, count: waiting.filter(record => record.stationId === station.id).length })).filter(item => item.count), [stations, waiting]);
  const availableStandards = selected ? matchingPackingStandards(config, selected.produce, selected.market || 'local', selected.destinationCountry) : [];
  const selectedStandard = availableStandards.find(standard => standard.id === standardId);
  const selectedGrade = selectedStandard?.grades.find(item => item.name === grade);
  const requiredChecks = selectedStandard ? [...selectedStandard.requiredChecks, ...(selectedGrade?.acceptanceCriteria ?? [])] : [];
  const inspectionPackageTypes = selectedStandard?.packageTypes ?? standards.packageTypes;
  const inspectionPackageSizes = selectedStandard?.packageSizes ?? standards.packageSizes;
  const inspectionGrades = selectedStandard ? standardGradeNames(selectedStandard) : standards.qualityGrades;
  const inspectionReasons = selectedStandard?.rejectionReasons ?? standards.rejectionReasons;

  function chooseStandard(id: string) {
    const standard = availableStandards.find(item => item.id === id);
    setStandardId(id); setConfirmedChecks([]);
    if (!standard) return;
    setPackageType(standard.packageTypes[0] || 'Carton');
    setPackageSize(standard.packageSizes[0] || 'Customer specification');
    setGrade(standardGradeNames(standard)[0] || 'Grade A');
  }

  function open(record: PackingRecord, eventType: PackingQualityEventType) {
    setSelected(record); setMode(eventType); setMessage('');
    const matches = matchingPackingStandards(config, record.produce, record.market || 'local', record.destinationCountry);
    const matched = matches.find(item => item.id === record.qualityStandardId) ?? matches[0];
    setStandardId(matched?.id || '');
    setPackageType(record.packageType || matched?.packageTypes[0] || standards.packageTypes[0] || 'Carton');
    setPackageSize(record.packageSize || matched?.packageSizes[0] || standards.packageSizes[0] || 'Standard');
    setGrade(record.qualityGrade || (matched ? standardGradeNames(matched)[0] : standards.qualityGrades[0]) || 'Grade A');
    setConfirmedChecks([]);
    setLotNumber(record.lotNumber || `LOT-${record.date.replaceAll('-', '')}-${record.id.slice(0, 6).toUpperCase()}`);
    setPalletId(record.palletId || ''); setStorageLocation(record.storageLocation || ''); setReason(eventType === 'correction' ? 'Data entry correction' : ''); setNotes('');
    setPacked(record.packedBoxes);
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
    let packedDelta = 0, acceptedDelta = accepted, rejectedDelta = rejected, reworkDelta = rework, inspectedDelta = accepted + rejected + rework;
    if (mode === 'rework_resolution') {
      if (accepted + rejected <= 0 || accepted + rejected > currentRework) return setMessage(`Resolve between 1 and ${currentRework} rework boxes.`);
      reworkDelta = -(accepted + rejected); inspectedDelta = 0;
    } else if (mode === 'correction') {
      const allocated = shippedBoxesByRecord.get(selected.id) ?? 0;
      if (packed <= 0 || accepted < 0 || rejected < 0 || rework < 0 || accepted + rejected + rework > packed) return setMessage('Corrected totals must be non-negative and cannot exceed the final packed quantity.');
      if (accepted < allocated) return setMessage(`${allocated} accepted boxes from this record are already allocated to shipments. Final accepted boxes cannot be lower than that.`);
      packedDelta = packed - selected.packedBoxes;
      acceptedDelta = accepted - currentAccepted; rejectedDelta = rejected - currentRejected; reworkDelta = rework - currentRework;
      inspectedDelta = accepted + rejected + rework - currentInspected;
      if (packedDelta === 0 && acceptedDelta === 0 && rejectedDelta === 0 && reworkDelta === 0) return setMessage('Change the packed quantity or at least one quality total before saving a correction.');
    } else {
      const remaining = selected.packedBoxes - currentInspected;
      if (inspectedDelta <= 0 || inspectedDelta > remaining) return setMessage(`Inspect between 1 and ${remaining} awaiting boxes.`);
    }
    if (!packageType.trim() || !grade.trim() || !lotNumber.trim()) return setMessage('Package type, quality grade and lot number are required.');
    if (selected.market && currentInspected === 0 && !selectedStandard) return setMessage(`No approved ${packingMarketLabel(selected.market).toLowerCase()} standard matches ${selected.produce}${selected.destinationCountry ? ` for ${selected.destinationCountry}` : ''}. Ask a manager to configure one before accepting this lot.`);
    if (mode === 'inspection' && currentInspected === 0 && selectedStandard && requiredChecks.some(item => !confirmedChecks.includes(item))) return setMessage('Confirm every requirement from the selected standard before saving the first quality decision.');
    if (currentInspected > 0 && (
      packageType.trim() !== selected.packageType
      || packageSize.trim() !== (selected.packageSize || '')
      || grade.trim() !== selected.qualityGrade
      || lotNumber.trim() !== selected.lotNumber
      || palletId.trim() !== (selected.palletId || '')
      || storageLocation.trim() !== (selected.storageLocation || '')
    )) return setMessage('Traceability details are locked after the first inspection. Record a separate packing session for a different lot, grade, package, pallet, or storage location.');
    if ((rejectedDelta > 0 || reworkDelta > 0 || mode === 'correction') && reason.trim().length < 3) return setMessage('Select or enter a reason for rejected, rework or corrected quantities.');
    const projected = { packedBoxes: selected.packedBoxes + packedDelta, inspectedBoxes: currentInspected + inspectedDelta, acceptedBoxes: currentAccepted + acceptedDelta, rejectedBoxes: currentRejected + rejectedDelta, reworkBoxes: currentRework + reworkDelta };
    const status = packingInspectionStatus(projected);
    setSaving(true); setMessage('');
    try {
      await onRecord({ packingRecordId: selected.id, eventType: mode, stationId: selected.stationId, stationName: selected.stationName, produce: selected.produce, market: selected.market, destinationCountry: selected.destinationCountry, qualityStandardId: selectedStandard?.id || selected.qualityStandardId, qualityStandardName: selectedStandard?.name || selected.qualityStandardName, qualityStandardAuthority: selectedStandard?.authority || selected.qualityStandardAuthority, qualityStandardReference: selectedStandard?.reference || selected.qualityStandardReference, qualityStandardVersion: selectedStandard?.version || selected.qualityStandardVersion, qualityStandardSourceUrl: selectedStandard?.sourceUrl || selected.qualityStandardSourceUrl, confirmedChecks: mode === 'inspection' ? confirmedChecks : undefined, packageType: packageType.trim(), packageSize: packageSize.trim() || undefined, qualityGrade: grade.trim(), lotNumber: lotNumber.trim(), palletId: palletId.trim() || undefined, storageLocation: storageLocation.trim() || undefined, packedDelta, inspectedDelta, acceptedDelta, rejectedDelta, reworkDelta, reason: reason.trim() || undefined, notes: notes.trim() || undefined, inspectorId: userId, inspectorName: userName, inspectedAt: new Date().toISOString() }, status);
      setSelected(null); setMessage(mode === 'correction' ? 'Audited correction saved.' : 'Quality decision saved. Accepted stock is now available for dispatch.');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Quality inspection could not be saved.'); }
    finally { setSaving(false); }
  }

  async function saveStandards() {
    const value = { packageTypes: list(settings.packageTypes), packageSizes: list(settings.packageSizes), qualityGrades: list(settings.qualityGrades), rejectionReasons: list(settings.rejectionReasons), commodityStandards: config?.commodityStandards ?? [] };
    if (!value.packageTypes.length || !value.qualityGrades.length || !value.rejectionReasons.length) return setMessage('Keep at least one package type, grade and rejection reason.');
    setSaving(true); try { await onSaveConfig(value); setMessage('Quality standards saved.'); } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Standards could not be saved.'); } finally { setSaving(false); }
  }

  async function addCommodityStandard() {
    const gradeNames = list(standardForm.grades);
    if (!standardForm.name.trim() || !standardForm.commodity.trim() || !standardForm.authority.trim() || !standardForm.reference.trim() || !gradeNames.length) return setMessage('Standard name, commodity, authority, reference and at least one grade are required.');
    if (standardForm.market === 'export' && !standardForm.destinationCountries.trim()) return setMessage('Enter the export destination country or countries. Use a separate profile when requirements differ by market.');
    if (standardForm.market === 'export' && !standardForm.sourceUrl.trim()) return setMessage('Add the official source URL for an export standard so its authority and version can be verified.');
    if (standardForm.sourceUrl.trim() && !isWebUrl(standardForm.sourceUrl.trim())) return setMessage('Official source URL must begin with https:// or http://.');
    const standard: PackingCommodityStandard = {
      id: `standard-${Date.now()}`,
      name: standardForm.name.trim(), commodity: standardForm.commodity.trim(), market: standardForm.market,
      destinationCountries: list(standardForm.destinationCountries), authority: standardForm.authority.trim(), reference: standardForm.reference.trim(), version: standardForm.version.trim() || 'Current approved version', ...(standardForm.sourceUrl.trim() ? { sourceUrl: standardForm.sourceUrl.trim() } : {}),
      packageTypes: list(standardForm.packageTypes), packageSizes: list(standardForm.packageSizes),
      grades: gradeNames.map(name => ({ name, description: `${name} under ${standardForm.reference.trim()}`, acceptanceCriteria: [] })),
      rejectionReasons: list(standardForm.rejectionReasons), requiredChecks: checks(standardForm.requiredChecks), isActive: true,
    };
    const next = [...(config?.commodityStandards ?? []), standard];
    setSaving(true);
    try {
      await onSaveConfig({ packageTypes: standards.packageTypes, packageSizes: standards.packageSizes, qualityGrades: standards.qualityGrades, rejectionReasons: standards.rejectionReasons, commodityStandards: next });
      setStandardForm(EMPTY_STANDARD); setMessage('Commodity market standard saved. It is now available only for matching produce and destinations.');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Commodity standard could not be saved.'); }
    finally { setSaving(false); }
  }

  async function archiveCommodityStandard(id: string) {
    if (!window.confirm('Archive this standard? Existing lot audit history will retain its standard snapshot.')) return;
    const next = (config?.commodityStandards ?? []).map(standard => standard.id === id ? { ...standard, isActive: false } : standard);
    setSaving(true);
    try {
      await onSaveConfig({ packageTypes: standards.packageTypes, packageSizes: standards.packageSizes, qualityGrades: standards.qualityGrades, rejectionReasons: standards.rejectionReasons, commodityStandards: next });
      setMessage('Commodity standard archived. It will not be offered for new inspections.');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Commodity standard could not be archived.'); }
    finally { setSaving(false); }
  }

  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Card><CardContent className="p-4"><p className="text-2xl font-bold">{waiting.length}</p><p className="text-xs text-muted-foreground">Awaiting action</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-2xl font-bold text-green-700">{acceptedStock}</p><p className="text-xs text-muted-foreground">Accepted boxes recorded</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-2xl font-bold text-amber-700">{qualityRecords.reduce((sum, item) => sum + (item.reworkBoxes ?? 0), 0)}</p><p className="text-xs text-muted-foreground">In rework</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-2xl font-bold text-red-700">{rejectedTotal}</p><p className="text-xs text-muted-foreground">Rejected boxes</p></CardContent></Card></div>
    <div className="flex gap-1 overflow-x-auto border-b">{([['queue', 'Inspection queue', ClipboardCheck], ['audit', 'Quality audit', History], ...(canManage ? [['standards', 'Standards', Settings2] as const] : [])] as const).map(([id, label, Icon]) => <button key={id} onClick={() => setSection(id)} className={`inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold ${section === id ? 'border-green-700 text-green-700' : 'border-transparent text-muted-foreground'}`}><Icon className="h-4 w-4" />{label}</button>)}</div>
    {message && <div className="rounded-lg border bg-muted/40 p-3 text-sm">{message}</div>}
    {section === 'queue' && <div className="space-y-3">{openByStation.length > 0 && <p className="text-xs text-muted-foreground">{openByStation.map(item => `${item.station.name}: ${item.count}`).join(' · ')}</p>}{waiting.map(record => { const remaining = record.packedBoxes - (record.inspectedBoxes ?? 0); return <Card key={record.id}><CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2"><Badge variant="outline">{statusText(record.inspectionStatus)}</Badge><Badge variant="secondary">{record.produce}</Badge></div><p className="mt-2 font-semibold">{record.stationName} · {record.date}</p><p className="text-xs text-muted-foreground">{record.packedBoxes} packed · {record.acceptedBoxes ?? 0} accepted · {record.reworkBoxes ?? 0} rework · {record.rejectedBoxes ?? 0} rejected</p>{record.lotNumber && <p className="text-xs text-muted-foreground">Lot {record.lotNumber}{record.palletId ? ` · Pallet ${record.palletId}` : ''}</p>}</div><div className="flex flex-wrap gap-2">{remaining > 0 && <Button size="sm" onClick={() => open(record, 'inspection')}><ClipboardCheck className="mr-2 h-4 w-4" />Inspect {remaining}</Button>}{(record.reworkBoxes ?? 0) > 0 && <Button size="sm" variant="outline" onClick={() => open(record, 'rework_resolution')}><RotateCcw className="mr-2 h-4 w-4" />Resolve rework</Button>}{canManage && <Button size="sm" variant="ghost" onClick={() => open(record, 'correction')}>Correct</Button>}</div></CardContent></Card>})}{waiting.length === 0 && <Card><CardContent className="py-12 text-center"><CheckCircle2 className="mx-auto mb-3 h-9 w-9 text-green-600" /><p className="font-semibold">Quality queue is clear</p><p className="text-sm text-muted-foreground">New packing sessions will wait here until inspected.</p></CardContent></Card>}</div>}
    {section === 'audit' && <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" />Append-only quality history</CardTitle></CardHeader><CardContent className="space-y-2">{events.map(event => <div key={event.id} className="rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">{event.stationName} · {event.produce}</p><p className="text-xs text-muted-foreground">{packingMarketLabel(event.market)}{event.destinationCountry ? ` · ${event.destinationCountry}` : ''}</p></div><Badge variant="outline">{event.eventType.replaceAll('_', ' ')}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{new Date(event.inspectedAt).toLocaleString()} · {event.inspectorName} · Lot {event.lotNumber}</p>{event.qualityStandardReference && <p className="mt-1 text-xs font-medium">{event.qualityStandardAuthority} · {event.qualityStandardReference} · {event.qualityStandardVersion}</p>}<p className="mt-1 text-sm">{(event.packedDelta ?? 0) !== 0 && <><span className="font-medium">Packed {(event.packedDelta ?? 0) >= 0 ? '+' : ''}{event.packedDelta}</span> · </>}<span className="text-green-700">Accepted {event.acceptedDelta >= 0 ? '+' : ''}{event.acceptedDelta}</span> · <span className="text-amber-700">Rework {event.reworkDelta >= 0 ? '+' : ''}{event.reworkDelta}</span> · <span className="text-red-700">Rejected {event.rejectedDelta >= 0 ? '+' : ''}{event.rejectedDelta}</span></p>{event.reason && <p className="text-xs text-muted-foreground">Reason: {event.reason}</p>}</div>)}{events.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No quality events recorded yet.</p>}</CardContent></Card>}
    {section === 'standards' && canManage && <div className="space-y-4">
      <Card><CardHeader><CardTitle className="text-base">Legacy fallback lists</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">These options support historical records. New local and export lots should use a commodity market standard below.</p><div className="grid gap-3 md:grid-cols-2">{([['packageTypes', 'Package types'], ['packageSizes', 'Package sizes'], ['qualityGrades', 'Quality grades'], ['rejectionReasons', 'Rejection / rework reasons']] as const).map(([key, label]) => <div key={key}><Label>{label}</Label><Input className="mt-1" value={settings[key]} onChange={event => setSettings(current => ({ ...current, [key]: event.target.value }))} /></div>)}</div><div className="flex justify-end"><Button disabled={saving} onClick={() => void saveStandards()}><Save className="mr-2 h-4 w-4" />Save fallback lists</Button></div></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" />Commodity and market standards</CardTitle></CardHeader><CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Standards are matched by produce, local/export market and destination country. Codex banana and okra export baselines are included; destination laws and customer specifications may require stricter profiles.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div><Label>Standard name *</Label><Input className="mt-1" value={standardForm.name} onChange={event => setStandardForm(current => ({ ...current, name: event.target.value }))} placeholder="Ghana local Grade A" /></div>
          <div><Label>Commodity *</Label><Input className="mt-1" list="packing-commodities" value={standardForm.commodity} onChange={event => setStandardForm(current => ({ ...current, commodity: event.target.value }))} /><datalist id="packing-commodities">{produceTypes.map(item => <option key={item} value={item} />)}</datalist></div>
          <div><Label>Market *</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={standardForm.market} onChange={event => setStandardForm(current => ({ ...current, market: event.target.value as PackingMarket, destinationCountries: event.target.value === 'local' ? '' : current.destinationCountries }))}><option value="local">Local market</option><option value="export">Export market</option></select></div>
          {standardForm.market === 'export' && <div><Label>Destination countries *</Label><Input className="mt-1" value={standardForm.destinationCountries} onChange={event => setStandardForm(current => ({ ...current, destinationCountries: event.target.value }))} placeholder="United Kingdom, Germany" /></div>}
          <div><Label>Authority *</Label><Input className="mt-1" value={standardForm.authority} onChange={event => setStandardForm(current => ({ ...current, authority: event.target.value }))} placeholder="Ghana Standards Authority" /></div>
          <div><Label>Reference *</Label><Input className="mt-1" value={standardForm.reference} onChange={event => setStandardForm(current => ({ ...current, reference: event.target.value }))} placeholder="Official standard number" /></div>
          <div><Label>Version</Label><Input className="mt-1" value={standardForm.version} onChange={event => setStandardForm(current => ({ ...current, version: event.target.value }))} /></div>
          <div className="sm:col-span-2"><Label>Official source URL</Label><Input className="mt-1" type="url" value={standardForm.sourceUrl} onChange={event => setStandardForm(current => ({ ...current, sourceUrl: event.target.value }))} /></div>
          <div><Label>Package types</Label><Input className="mt-1" value={standardForm.packageTypes} onChange={event => setStandardForm(current => ({ ...current, packageTypes: event.target.value }))} /></div>
          <div><Label>Package sizes</Label><Input className="mt-1" value={standardForm.packageSizes} onChange={event => setStandardForm(current => ({ ...current, packageSizes: event.target.value }))} /></div>
          <div><Label>Grades *</Label><Input className="mt-1" value={standardForm.grades} onChange={event => setStandardForm(current => ({ ...current, grades: event.target.value }))} /></div>
          <div className="sm:col-span-2"><Label>Rejection reasons</Label><Input className="mt-1" value={standardForm.rejectionReasons} onChange={event => setStandardForm(current => ({ ...current, rejectionReasons: event.target.value }))} /></div>
          <div className="sm:col-span-2 lg:col-span-3"><Label>Mandatory inspection checks</Label><textarea className="mt-1 min-h-24 w-full rounded-md border bg-background p-3 text-sm" value={standardForm.requiredChecks} onChange={event => setStandardForm(current => ({ ...current, requiredChecks: event.target.value }))} placeholder="One check per line" /></div>
        </div>
        <div className="flex justify-end"><Button disabled={saving} onClick={() => void addCommodityStandard()}><Plus className="mr-2 h-4 w-4" />Add approved standard</Button></div>
        <div className="grid gap-2 md:grid-cols-2">{packingStandardCatalog(config).map(standard => { const custom = config?.commodityStandards?.some(item => item.id === standard.id); return <div key={standard.id} className="rounded-lg border p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{standard.name}</p><p className="text-xs text-muted-foreground">{standard.commodity} · {packingMarketLabel(standard.market)}{standard.destinationCountries.length ? ` · ${standard.destinationCountries.join(', ')}` : ' · International baseline'}</p><p className="mt-1 text-xs">{standard.authority} · {standard.reference} · {standard.version}</p></div><div className="flex">{isWebUrl(standard.sourceUrl) && <a href={standard.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Open ${standard.name}`} className="rounded p-2 hover:bg-muted"><ExternalLink className="h-4 w-4" /></a>}{custom && <Button size="icon" variant="ghost" disabled={saving} aria-label={`Archive ${standard.name}`} onClick={() => void archiveCommodityStandard(standard.id)}><Archive className="h-4 w-4" /></Button>}</div></div></div>; })}</div>
      </CardContent></Card>
    </div>}

    {section === 'audit' && canManage && <Card><CardHeader><CardTitle className="text-base">Correct processed packing history</CardTitle></CardHeader><CardContent className="space-y-2"><p className="mb-3 text-sm text-muted-foreground">Corrections preserve the original audit history. Accepted quantities cannot be reduced below boxes already allocated to shipments.</p>{qualityRecords.filter(record => (record.inspectedBoxes ?? 0) > 0).map(record => <div key={`correct-${record.id}`} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{record.stationName} · {record.produce}</p><p className="text-xs text-muted-foreground">{record.date} · {record.packedBoxes} packed · {record.acceptedBoxes ?? 0} accepted · Lot {record.lotNumber || 'Not set'}</p></div><Button size="sm" variant="outline" onClick={() => open(record, 'correction')}><ShieldCheck className="mr-2 h-4 w-4" />Correct record</Button></div>)}{qualityRecords.every(record => (record.inspectedBoxes ?? 0) === 0) && <p className="py-5 text-center text-sm text-muted-foreground">No processed records require correction.</p>}</CardContent></Card>}

    {selected && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-3" role="dialog" aria-modal="true" aria-label={mode === 'correction' ? 'Correct packing record' : 'Quality inspection'}>
      <Card className="max-h-[92vh] w-full max-w-3xl overflow-y-auto"><CardHeader><CardTitle className="flex items-center justify-between">{mode === 'correction' ? 'Correct packing and quality totals' : mode === 'rework_resolution' ? 'Resolve rework' : 'Inspect packed boxes'}<button aria-label="Close inspection" onClick={() => setSelected(null)}><X className="h-5 w-5" /></button></CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/40 p-3 text-sm"><p className="font-semibold">{selected.stationName} · {selected.produce} · {selected.packedBoxes} packed boxes</p><p className="mt-1 text-xs text-muted-foreground">{packingMarketLabel(selected.market)}{selected.destinationCountry ? ` · Destination: ${selected.destinationCountry}` : ''}{(shippedBoxesByRecord.get(selected.id) ?? 0) > 0 ? ` · ${shippedBoxesByRecord.get(selected.id)} already shipped` : ''}</p></div>
        {selected.market && availableStandards.length === 0 && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">No approved standard matches this commodity and market. This lot cannot be accepted until a manager adds the applicable local or destination-country standard.</div>}
        {mode === 'correction' && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This creates a dated audit entry; it does not overwrite or remove the earlier quality decision.</div>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-3"><Label>Applicable quality standard *</Label><select disabled={(selected.inspectedBoxes ?? 0) > 0} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-70" value={standardId} onChange={event => chooseStandard(event.target.value)}><option value="">Select approved standard</option>{selected.qualityStandardId && !availableStandards.some(item => item.id === selected.qualityStandardId) && <option value={selected.qualityStandardId}>{selected.qualityStandardName} · {selected.qualityStandardReference} (historical)</option>}{availableStandards.map(standard => <option key={standard.id} value={standard.id}>{standard.name} · {standard.authority} · {standard.reference}</option>)}</select>{selectedStandard && <p className="mt-1 text-xs text-muted-foreground">{selectedStandard.version}{selectedStandard.destinationCountries.length ? ` · Approved for ${selectedStandard.destinationCountries.join(', ')}` : ' · International baseline; check destination-specific additions'}</p>}</div>
          {([['packageType', 'Package type', packageType, setPackageType, inspectionPackageTypes], ['packageSize', 'Package size', packageSize, setPackageSize, inspectionPackageSizes], ['grade', 'Quality grade', grade, setGrade, inspectionGrades]] as const).map(([, label, value, setter, options]) => <div key={label}><Label>{label}</Label><select disabled={(selected.inspectedBoxes ?? 0) > 0} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-70" value={value} onChange={event => { setter(event.target.value); if (label === 'Quality grade') setConfirmedChecks([]); }}>{options.map(option => <option key={option}>{option}</option>)}</select></div>)}
          <div><Label>Lot number *</Label><Input disabled={(selected.inspectedBoxes ?? 0) > 0} className="mt-1" value={lotNumber} onChange={event => setLotNumber(event.target.value)} /></div>
          <div><Label>Pallet ID</Label><Input disabled={(selected.inspectedBoxes ?? 0) > 0} className="mt-1" value={palletId} onChange={event => setPalletId(event.target.value)} /></div>
          <div><Label>Storage location</Label><Input disabled={(selected.inspectedBoxes ?? 0) > 0} className="mt-1" value={storageLocation} onChange={event => setStorageLocation(event.target.value)} /></div>
          {mode === 'correction' && <div><Label>Final packed boxes</Label><Input className="mt-1" type="number" min="1" value={packed || ''} onChange={event => setPacked(Number(event.target.value) || 0)} /></div>}
          <div><Label>{mode === 'correction' ? 'Final accepted' : 'Accept'}</Label><Input className="mt-1" type="number" min="0" value={accepted || ''} onChange={event => setAccepted(Number(event.target.value) || 0)} /></div>
          <div><Label>{mode === 'correction' ? 'Final rework' : 'Send to rework'}</Label><Input className="mt-1" type="number" min="0" value={rework || ''} onChange={event => setRework(Number(event.target.value) || 0)} disabled={mode === 'rework_resolution'} /></div>
          <div><Label>{mode === 'correction' ? 'Final rejected' : 'Reject'}</Label><Input className="mt-1" type="number" min="0" value={rejected || ''} onChange={event => setRejected(Number(event.target.value) || 0)} /></div>
          <div className="sm:col-span-2"><Label>Reason</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={reason} onChange={event => setReason(event.target.value)}><option value="">No rejection or rework</option>{!inspectionReasons.includes('Data entry correction') && <option>Data entry correction</option>}{inspectionReasons.map(option => <option key={option}>{option}</option>)}</select></div>
          <div><Label>Inspection notes</Label><Input className="mt-1" value={notes} onChange={event => setNotes(event.target.value)} /></div>
        </div>
        {mode === 'inspection' && selectedStandard && (selected.inspectedBoxes ?? 0) === 0 && <div className="rounded-lg border p-4"><p className="font-semibold">Required standard checks</p><p className="mb-3 text-xs text-muted-foreground">Confirm these against the sampled lot. Confirmation and the standard version are retained in the audit history.</p><div className="space-y-2">{requiredChecks.map(item => <label key={item} className="flex cursor-pointer gap-2 rounded-md border p-2 text-sm"><input type="checkbox" checked={confirmedChecks.includes(item)} onChange={() => setConfirmedChecks(current => current.includes(item) ? current.filter(check => check !== item) : [...current, item])} /><span>{item}</span></label>)}</div></div>}
        {message && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</div>}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button><Button disabled={saving} onClick={() => void submit()}><ShieldCheck className="mr-2 h-4 w-4" />{saving ? 'Saving...' : mode === 'correction' ? 'Save audited correction' : 'Save quality decision'}</Button></div>
      </CardContent></Card>
    </div>}
  </div>;
}
