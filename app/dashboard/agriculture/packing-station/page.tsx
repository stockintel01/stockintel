'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Archive, Boxes, CalendarClock, CheckCircle2, ClipboardList, Copy, Edit3, Package, Pause, Play, Plus, Save, Settings2, ShieldCheck, Trash2, Truck, Users, X } from 'lucide-react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { db } from '@/lib/firebase';
import { getAgricultureProfile } from '@/lib/agric/config';
import { acceptedPackingBoxes, buildPackingFulfilmentOccurrences, calculatePackingDailyMetrics, packingCalendarDate, packingDateOffset, packingPlanOperationalFieldsChanged, planPackingShipmentAllocations, type PackingFulfilmentOccurrence, type PackingOccurrenceStatus } from '@/lib/agric/packing';
import type { FarmZone, PackingFulfilmentPlan, PackingRecord, PackingStation, ShippingRecord } from '@/lib/agric/types';
import { useAgric } from '@/lib/agric/useAgric';
import { useAppStore } from '@/lib/store';
import { PackingQualityPanel } from '@/components/agriculture/PackingQualityPanel';

const SHIFTS = ['morning', 'afternoon', 'evening'] as const;
const DEFAULT_PRODUCE = ['Banana', 'Okra', 'Papaya', 'Tomato', 'Beans', 'Moringa', 'Passion Fruit'];
type Tab = 'queue' | 'quality' | 'packing' | 'shipping' | 'setup';

interface TeamMember { id: string; name: string; email: string }
interface PlanForm {
  id: string; activityName: string; customerName: string; destinationName: string; stationId: string;
  farmZone: string; produce: string; targetBoxes: number; startDate: string; dueTime: string;
  recurrence: PackingFulfilmentPlan['recurrence']; endDate: string; shipmentRequired: boolean;
  crewProfileId: string; transportProfileId: string; notes: string;
}

const emptyPlan = (date: string, stationId = '', farmZone = '', produce = 'Banana'): PlanForm => ({
  id: '', activityName: '', customerName: '', destinationName: '', stationId, farmZone, produce,
  targetBoxes: 0, startDate: date, dueTime: '', recurrence: 'none', endDate: '', shipmentRequired: true,
  crewProfileId: '', transportProfileId: '', notes: '',
});
const splitNames = (value: string) => value.split(/[\n,]+/).map(name => name.trim()).filter(Boolean);
const statusLabel = (status: PackingOccurrenceStatus) => status.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const statusTone = (status: PackingOccurrenceStatus) => status === 'overdue' ? 'border-red-200 bg-red-50/60' : status === 'ready_to_ship' ? 'border-purple-200 bg-purple-50/60' : status === 'in_progress' ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200';

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3" role="dialog" aria-modal="true" aria-label={title}><Card className="max-h-[92vh] w-full max-w-3xl overflow-y-auto"><CardHeader><CardTitle className="flex items-center justify-between gap-3">{title}<button type="button" aria-label={`Close ${title}`} onClick={onClose}><X className="h-5 w-5" /></button></CardTitle></CardHeader><CardContent>{children}</CardContent></Card></div>;
}

export default function PackingStationPage() {
  const today = packingCalendarDate();
  const agric = useAgric();
  const { user, organization } = useAppStore();
  const canManage = ['owner', 'manager', 'super_admin'].includes(user?.role ?? '');
  const profile = getAgricultureProfile(organization?.settings);
  const farmZones = profile.farmZones.length ? profile.farmZones : ['Main Farm'];
  const produceTypes = Array.from(new Set([...profile.cropTypes, ...DEFAULT_PRODUCE])).filter(Boolean);
  const userId = user?.id ?? '';
  const userName = user?.name ?? 'Supervisor';

  const [stations, setStations] = useState<PackingStation[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [tab, setTab] = useState<Tab>('queue');
  const [qualityInitialSection, setQualityInitialSection] = useState<'queue' | 'audit'>('queue');
  const [online, setOnline] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [packingOpen, setPackingOpen] = useState(false);
  const [editingPackingId, setEditingPackingId] = useState<string | null>(null);
  const [shippingOpen, setShippingOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [workersInput, setWorkersInput] = useState('');
  const [packing, setPacking] = useState<Partial<PackingRecord>>({ date: today, stationId: '', farmZone: farmZones[0] as FarmZone, produce: produceTypes[0] ?? 'Banana', shift: 'morning', supervisorId: userId, supervisorName: userName, workers: [] });
  const [shipping, setShipping] = useState<Partial<ShippingRecord>>({ dispatchDate: today, stationId: '', produce: produceTypes[0] ?? 'Banana', supervisorId: userId });
  const [plan, setPlan] = useState<PlanForm>(() => emptyPlan(today, '', farmZones[0], produceTypes[0]));
  const [crew, setCrew] = useState({ id: '', name: '', workers: '' });
  const [transport, setTransport] = useState({ id: '', label: '', vehicleId: '', driverName: '' });
  const [station, setStation] = useState({ id: '', name: '', storageName: '', assignedUserIds: [] as string[] });

  useEffect(() => {
    if (!organization?.id) return;
    return onSnapshot(query(collection(db, `organizations/${organization.id}/agric_packing_stations`), orderBy('name')), snapshot => setStations(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as PackingStation))), cause => setError(cause.message));
  }, [organization?.id]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  useEffect(() => {
    if (!organization?.id || !canManage) return;
    return onSnapshot(query(collection(db, 'users'), where('organizationId', '==', organization.id)), snapshot => setTeamMembers(snapshot.docs.map(item => {
      const data = item.data() as { displayName?: string; name?: string; email?: string };
      return { id: item.id, name: data.displayName || data.name || data.email || 'Team member', email: data.email || '' };
    }).sort((a, b) => a.name.localeCompare(b.name))), cause => setError(cause.message));
  }, [canManage, organization?.id]);

  const activeStations = stations.filter(item => item.isActive !== false);
  const assignedStations = activeStations.filter(item => item.assignedUserIds?.includes(userId));
  const usesAssignments = activeStations.some(item => item.assignedUserIds?.length);
  const visibleStations = canManage || !usesAssignments ? activeStations : assignedStations;
  const visibleIds = useMemo(() => new Set(visibleStations.map(item => item.id)), [visibleStations]);
  const visibleNames = useMemo(() => new Set(visibleStations.map(item => item.name)), [visibleStations]);
  const packingRecords = useMemo(() => canManage ? agric.packingRecords : agric.packingRecords.filter(item => visibleIds.has(item.stationId) || visibleNames.has(item.stationName)), [agric.packingRecords, canManage, visibleIds, visibleNames]);
  const shippingRecords = useMemo(() => canManage ? agric.shippingRecords : agric.shippingRecords.filter(item => Boolean(item.stationId && visibleIds.has(item.stationId)) || Boolean(item.stationName && visibleNames.has(item.stationName))), [agric.shippingRecords, canManage, visibleIds, visibleNames]);
  const plans = useMemo(() => canManage ? agric.packingPlans : agric.packingPlans.filter(item => visibleIds.has(item.stationId)), [agric.packingPlans, canManage, visibleIds]);
  const selectedPackingStation = visibleStations.find(item => item.id === packing.stationId) ?? visibleStations[0];
  const selectedShippingStation = visibleStations.find(item => item.id === shipping.stationId) ?? visibleStations[0];
  const fromDate = packingDateOffset(today, -365);
  const toDate = packingDateOffset(today, 90);
  const occurrences = useMemo(() => buildPackingFulfilmentOccurrences(plans, packingRecords, shippingRecords, fromDate, toDate, today), [fromDate, packingRecords, plans, shippingRecords, toDate, today]);
  const metrics = useMemo(() => calculatePackingDailyMetrics(today, occurrences, packingRecords, shippingRecords), [occurrences, packingRecords, shippingRecords, today]);
  const queueHorizon = packingDateOffset(today, 14);
  const openWork = occurrences.filter(item => item.status !== 'completed' && (item.status !== 'pending' || item.occurrenceDate <= queueHorizon)).sort((a, b) => ({ overdue: 0, ready_to_ship: 1, in_progress: 2, pending: 3, completed: 4 })[a.status] - ({ overdue: 0, ready_to_ship: 1, in_progress: 2, pending: 3, completed: 4 })[b.status] || a.occurrenceDate.localeCompare(b.occurrenceDate));
  const completed = occurrences.filter(item => item.status === 'completed').slice(-8).reverse();
  const qualityQueueCount = packingRecords.filter(item => item.inspectionStatus && ((item.inspectedBoxes ?? 0) < item.packedBoxes || (item.reworkBoxes ?? 0) > 0)).length;
  const shippedBoxesByPackingRecord = useMemo(() => {
    const result = new Map<string, number>();
    shippingRecords.forEach(record => record.allocations?.forEach(allocation => {
      result.set(allocation.packingRecordId, (result.get(allocation.packingRecordId) ?? 0) + allocation.boxes);
    }));
    return result;
  }, [shippingRecords]);

  const stationStock = useMemo(() => {
    const result = new Map<string, { stationId: string; stationName: string; storageName?: string; produce: string; boxes: number }>();
    const key = (stationId: string, produce: string) => `${stationId}::${produce}`;
    packingRecords.forEach(record => {
      const configured = activeStations.find(item => item.id === record.stationId || item.name === record.stationName);
      const stationId = configured?.id ?? record.stationId ?? record.stationName;
      const itemKey = key(stationId, record.produce);
      const current = result.get(itemKey) ?? { stationId, stationName: configured?.name ?? record.stationName, storageName: configured?.storageName, produce: record.produce, boxes: 0 };
      current.boxes += record.inspectionStatus ? Math.max(0, record.acceptedBoxes ?? 0) : Math.max(0, record.packedBoxes - record.rejectedBoxes);
      result.set(itemKey, current);
    });
    shippingRecords.forEach(record => {
      const configured = activeStations.find(item => item.id === record.stationId || item.name === record.stationName);
      const stationId = configured?.id ?? record.stationId ?? record.stationName ?? 'unassigned';
      const itemKey = key(stationId, record.produce);
      const current = result.get(itemKey) ?? { stationId, stationName: configured?.name ?? record.stationName ?? 'Unassigned', storageName: configured?.storageName ?? record.storageName, produce: record.produce, boxes: 0 };
      current.boxes -= record.boxesShipped;
      result.set(itemKey, current);
    });
    return Array.from(result.values()).filter(item => item.boxes > 0);
  }, [activeStations, packingRecords, shippingRecords]);
  const available = stationStock.find(item => item.stationId === selectedShippingStation?.id && item.produce === shipping.produce)?.boxes ?? 0;
  const recentCrews = useMemo(() => {
    const seen = new Set<string>();
    return packingRecords.filter(item => item.workers.length).filter(item => { const key = [...item.workers].sort().join('|').toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 4);
  }, [packingRecords]);
  const editedPlan = plan.id ? agric.packingPlans.find(item => item.id === plan.id) : undefined;
  const planHasRecordedWork = Boolean(plan.id && (
    packingRecords.some(item => item.fulfilmentPlanId === plan.id)
    || shippingRecords.some(item => item.fulfilmentPlanId === plan.id)
  ));

  function notify(nextMessage = '') { setError(''); setMessage(nextMessage); }
  function openPacking(item?: PackingFulfilmentOccurrence, copy?: PackingRecord) {
    notify();
    setEditingPackingId(null);
    const savedCrew = item ? agric.packingCrews.find(option => option.id === item.plan.crewProfileId) : undefined;
    setPacking({ date: today, stationId: item?.plan.stationId || copy?.stationId || visibleStations[0]?.id || '', stationName: item?.plan.stationName || copy?.stationName, farmZone: (item?.plan.farmZone || copy?.farmZone || farmZones[0]) as FarmZone, produce: item?.plan.produce || copy?.produce || produceTypes[0], targetBoxes: item?.plan.targetBoxes || copy?.targetBoxes || 0, packedBoxes: undefined, rejectedBoxes: 0, totalWeight: undefined, shift: copy?.shift || 'morning', supervisorId: userId, supervisorName: userName, workers: [], fulfilmentPlanId: item?.plan.id, fulfilmentOccurrenceDate: item?.occurrenceDate, customerName: item?.plan.customerName || copy?.customerName, notes: copy?.notes || '' });
    setWorkersInput(savedCrew?.workers.join(', ') || copy?.workers.join(', ') || '');
    setPackingOpen(true);
  }
  function openPackingEdit(record: PackingRecord) {
    notify();
    if ((record.inspectedBoxes ?? 0) > 0) return setError('This record has quality history. Use Quality audit to make a traceable correction.');
    setEditingPackingId(record.id);
    setPacking({ ...record });
    setWorkersInput(record.workers.join(', '));
    setPackingOpen(true);
  }
  function openShipping(item?: PackingFulfilmentOccurrence, copy?: ShippingRecord) {
    notify();
    const saved = item ? agric.packingTransportProfiles.find(option => option.id === item.plan.transportProfileId) : undefined;
    setShipping({ dispatchDate: today, destinationName: item?.plan.destinationName || item?.plan.customerName || copy?.destinationName || '', supervisorId: userId, stationId: item?.plan.stationId || copy?.stationId || visibleStations[0]?.id || '', stationName: item?.plan.stationName || copy?.stationName, produce: item?.plan.produce || copy?.produce || produceTypes[0], boxesShipped: undefined, weightShipped: undefined, vehicleId: saved?.vehicleId || copy?.vehicleId || '', driverName: saved?.driverName || copy?.driverName || '', invoiceNumber: '', fulfilmentPlanId: item?.plan.id, fulfilmentOccurrenceDate: item?.occurrenceDate, notes: copy?.notes || '' });
    setShippingOpen(true);
  }
  function openPlan(item?: PackingFulfilmentPlan, duplicate = false) {
    notify();
    setPlan(item ? { id: duplicate ? '' : item.id, activityName: duplicate ? `${item.activityName} copy` : item.activityName, customerName: item.customerName, destinationName: item.destinationName || '', stationId: item.stationId, farmZone: item.farmZone, produce: item.produce, targetBoxes: item.targetBoxes, startDate: duplicate ? today : item.startDate, dueTime: item.dueTime || '', recurrence: item.recurrence, endDate: duplicate ? '' : item.endDate || '', shipmentRequired: item.shipmentRequired, crewProfileId: item.crewProfileId || '', transportProfileId: item.transportProfileId || '', notes: item.notes || '' } : emptyPlan(today, activeStations[0]?.id, farmZones[0], produceTypes[0]));
    setPlanOpen(true);
  }

  async function submitPacking() {
    if (!selectedPackingStation || !packing.produce || !packing.packedBoxes || packing.packedBoxes <= 0) return setError('Choose a station and enter packed boxes above zero.');
    if ((packing.rejectedBoxes ?? 0) > 0) return setError('Save the packing session first, then record rejected or rework boxes through the Quality inspection tab.');
    notify();
    try {
      const operationalRecord = { date: packing.date || today, stationId: selectedPackingStation.id, stationName: selectedPackingStation.name, supervisorId: packing.supervisorId || userId, supervisorName: packing.supervisorName || userName, farmZone: (packing.farmZone || farmZones[0]) as FarmZone, produce: packing.produce, targetBoxes: packing.targetBoxes || 0, packedBoxes: packing.packedBoxes, totalWeight: packing.totalWeight, shift: packing.shift || 'morning', workers: splitNames(workersInput), fulfilmentPlanId: packing.fulfilmentPlanId, fulfilmentOccurrenceDate: packing.fulfilmentOccurrenceDate, customerName: packing.customerName, notes: packing.notes };
      if (editingPackingId) {
        await agric.updatePacking(editingPackingId, operationalRecord);
      } else {
        await agric.addPacking({ ...operationalRecord, rejectedBoxes: 0, inspectedBoxes: 0, acceptedBoxes: 0, reworkBoxes: 0, inspectionStatus: 'awaiting_inspection' });
      }
      setPackingOpen(false); setEditingPackingId(null); notify(editingPackingId ? 'Packing history corrected before inspection.' : 'Packing progress saved and sent to the quality inspection queue.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save packing progress.'); }
  }
  async function removePacking(record: PackingRecord) {
    if (!canManage || (record.inspectedBoxes ?? 0) > 0 || !record.inspectionStatus) return setError('Only uninspected packing records can be deleted. Use an audited quality correction for processed history.');
    const confirmation = window.prompt(`Type DELETE to permanently remove the uninspected ${record.produce} packing record from ${record.date}.`);
    if (confirmation !== 'DELETE') return;
    notify();
    try { await agric.deletePacking(record.id); notify('The uninspected packing record was permanently deleted.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to delete the packing record.'); }
  }
  async function submitShipping() {
    if (!selectedShippingStation || !shipping.produce || !shipping.destinationName?.trim() || !shipping.boxesShipped || shipping.boxesShipped <= 0) return setError('Choose a source, destination and number of boxes to ship.');
    if (shipping.boxesShipped > available) return setError(`Only ${available} ${shipping.produce} boxes are available at this station.`);
    notify();
    try {
      const allocationPlan = planPackingShipmentAllocations(packingRecords, shippingRecords, selectedShippingStation.id, shipping.produce, shipping.boxesShipped);
      await agric.addShipping({ dispatchDate: shipping.dispatchDate || today, destinationName: shipping.destinationName.trim(), supervisorId: userId, stationId: selectedShippingStation.id, stationName: selectedShippingStation.name, storageName: selectedShippingStation.storageName, produce: shipping.produce, boxesShipped: shipping.boxesShipped, weightShipped: shipping.weightShipped, vehicleId: shipping.vehicleId?.trim(), driverName: shipping.driverName?.trim(), invoiceNumber: shipping.invoiceNumber?.trim(), fulfilmentPlanId: shipping.fulfilmentPlanId, fulfilmentOccurrenceDate: shipping.fulfilmentOccurrenceDate, allocations: allocationPlan.allocations, notes: shipping.notes });
      setShippingOpen(false); notify(allocationPlan.untraceableBoxes > 0 ? `Shipment logged. ${allocationPlan.untraceableBoxes} legacy boxes have no historic lot reference.` : 'Shipment logged with accepted-lot traceability. Stock and fulfilment progress are now updated.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to log the shipment.'); }
  }
  async function submitPlan() {
    const configured = activeStations.find(item => item.id === plan.stationId);
    if (!configured || !plan.activityName.trim() || !plan.customerName.trim() || !plan.startDate || plan.targetBoxes <= 0) return setError('Activity, customer, station, date and a target above zero are required.');
    if (plan.endDate && plan.endDate < plan.startDate) return setError('The end date cannot be before the start date.');
    if (planHasRecordedWork && editedPlan && packingPlanOperationalFieldsChanged(editedPlan, plan)) {
      return setError('Operational terms are locked because work is already recorded. Duplicate this schedule to create new terms without changing historical results.');
    }
    notify();
    try {
      await agric.savePackingPlan({ activityName: plan.activityName.trim(), customerName: plan.customerName.trim(), destinationName: plan.destinationName.trim() || undefined, stationId: configured.id, stationName: configured.name, farmZone: plan.farmZone as FarmZone, produce: plan.produce, targetBoxes: plan.targetBoxes, startDate: plan.startDate, dueTime: plan.dueTime || undefined, recurrence: plan.recurrence, endDate: plan.recurrence === 'none' ? undefined : plan.endDate || undefined, shipmentRequired: plan.shipmentRequired, crewProfileId: plan.crewProfileId || undefined, transportProfileId: plan.transportProfileId || undefined, status: 'active', notes: plan.notes.trim() || undefined, createdBy: userId }, plan.id || undefined);
      setPlanOpen(false); notify(plan.id ? 'Packing schedule updated.' : 'Packing target added to the work queue.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save the schedule.'); }
  }
  async function saveCrew() {
    const workers = splitNames(crew.workers);
    if (!crew.name.trim() || !workers.length) return setError('Enter a team name and at least one worker.');
    try { await agric.savePackingCrew({ name: crew.name.trim(), workers, isActive: true }, crew.id || undefined); setCrew({ id: '', name: '', workers: '' }); notify('Packing team saved for quick reuse.'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save the team.'); }
  }
  async function saveTransport() {
    if (!transport.label.trim() || !transport.vehicleId.trim() || !transport.driverName.trim()) return setError('Label, vehicle registration and driver are required.');
    try { await agric.savePackingTransport({ label: transport.label.trim(), vehicleId: transport.vehicleId.trim(), driverName: transport.driverName.trim(), isActive: true }, transport.id || undefined); setTransport({ id: '', label: '', vehicleId: '', driverName: '' }); notify('Vehicle and driver saved for quick reuse.'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save the vehicle.'); }
  }
  async function saveStation() {
    if (!organization?.id || !station.name.trim()) return;
    const assignedUserNames = teamMembers.filter(member => station.assignedUserIds.includes(member.id)).map(member => member.name);
    const payload = { name: station.name.trim(), storageName: station.storageName.trim(), assignedUserIds: station.assignedUserIds, assignedUserNames, isActive: true, updatedAt: serverTimestamp() };
    try { if (station.id) await setDoc(doc(db, `organizations/${organization.id}/agric_packing_stations/${station.id}`), payload, { merge: true }); else await addDoc(collection(db, `organizations/${organization.id}/agric_packing_stations`), { ...payload, createdAt: serverTimestamp() }); setStation({ id: '', name: '', storageName: '', assignedUserIds: [] }); notify('Packing station saved.'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save the station.'); }
  }

  const metricCards = [
    { label: 'Packed Today', value: metrics.packedBoxes, detail: `${metrics.acceptedPackedBoxes} quality accepted`, tone: 'border-l-green-500 text-green-700' },
    { label: 'Target', value: metrics.targetBoxes || 'Not set', detail: metrics.targetBoxes ? 'Scheduled boxes' : 'No target scheduled', tone: 'border-l-blue-500 text-blue-700' },
    { label: 'Efficiency', value: metrics.efficiencyPercent === null ? '—' : `${metrics.efficiencyPercent}%`, detail: metrics.efficiencyPercent === null ? 'Set a target to measure' : 'Packed against target', tone: metrics.efficiencyPercent === null ? 'border-l-slate-400 text-slate-700' : metrics.efficiencyPercent >= 90 ? 'border-l-green-500 text-green-700' : metrics.efficiencyPercent >= 70 ? 'border-l-amber-500 text-amber-700' : 'border-l-red-500 text-red-700' },
    { label: 'Shipped Today', value: metrics.shippedBoxes, detail: 'Boxes dispatched', tone: 'border-l-purple-500 text-purple-700' },
  ];

  return <div className="space-y-5 pb-10">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><Badge variant="outline" className="mb-2">{online ? 'Live packhouse operations' : 'Offline · changes sync automatically'}</Badge><h1 className="text-2xl font-bold sm:text-3xl">Packing Station</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Work from today&apos;s queue, record output in parts, and dispatch directly from verified packhouse stock.</p></div><div className="flex flex-wrap gap-2">{canManage && <Button variant="outline" onClick={() => openPlan()}><CalendarClock className="mr-2 h-4 w-4" />Schedule work</Button>}<Button variant="outline" disabled={!selectedShippingStation} onClick={() => openShipping()}><Truck className="mr-2 h-4 w-4" />Log shipment</Button><Button disabled={!selectedPackingStation} onClick={() => openPacking()}><Plus className="mr-2 h-4 w-4" />Record packing</Button></div></header>
    {visibleStations.length === 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="mr-2 inline h-4 w-4" />No packing station is assigned to you. Ask a manager to assign your account under Setup.</div>}
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {message && <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</div>}

    <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">{metricCards.map(item => <Card key={item.label} className={`border-l-4 ${item.tone}`}><CardContent className="p-4 sm:p-5"><p className="text-2xl font-bold sm:text-3xl">{item.value}</p><p className="mt-1 text-sm font-semibold text-foreground">{item.label}</p><p className="text-xs text-muted-foreground">{item.detail}</p></CardContent></Card>)}</section>
    <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Package className="h-4 w-4 text-blue-600" />Available packhouse stock</CardTitle></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{stationStock.map(item => <button type="button" key={`${item.stationId}-${item.produce}`} onClick={() => { setShipping(current => ({ ...current, stationId: item.stationId, produce: item.produce })); setTab('shipping'); }} className="rounded-xl border p-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/50"><p className="text-2xl font-bold text-blue-700">{item.boxes}</p><p className="text-sm font-semibold">{item.produce} boxes</p><p className="text-xs text-muted-foreground">{item.stationName}{item.storageName ? ` · ${item.storageName}` : ''}</p></button>)}{stationStock.length === 0 && <div className="col-span-full py-5 text-center text-sm text-muted-foreground">No packed stock is awaiting shipment.</div>}</div></CardContent></Card>

    <nav className="sticky top-[4.5rem] z-30 -mx-1 overflow-x-auto border-b bg-background/95 px-1 backdrop-blur print:static"><div className="flex min-w-max gap-1">{([
      ['queue', `Work queue${openWork.length ? ` (${openWork.length})` : ''}`, ClipboardList], ['quality', `Quality${qualityQueueCount ? ` (${qualityQueueCount})` : ''}`, ShieldCheck], ['packing', 'Packing history', Boxes], ['shipping', 'Shipping history', Truck], ...(canManage ? [['setup', 'Schedules & setup', Settings2] as const] : []),
    ] as const).map(([value, label, Icon]) => <button key={value} type="button" onClick={() => { if (value === 'quality') setQualityInitialSection('queue'); setTab(value); }} className={`inline-flex h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold ${tab === value ? 'border-green-700 text-green-700' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><Icon className="h-4 w-4" />{label}</button>)}</div></nav>

    {tab === 'queue' && <section className="space-y-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-bold">Awaiting fulfilment</h2><p className="text-sm text-muted-foreground">Recurring and one-off work appears here automatically. Partial packing and shipping remain open until complete.</p></div>{canManage && <Button size="sm" onClick={() => openPlan()}><Plus className="mr-2 h-4 w-4" />Add target</Button>}</div><div className="grid gap-3 xl:grid-cols-2">{openWork.map(item => <Card key={item.key} className={statusTone(item.status)}><CardContent className="p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap gap-2"><Badge variant="outline">{statusLabel(item.status)}</Badge>{item.plan.recurrence !== 'none' && <Badge variant="secondary">{item.plan.recurrence}</Badge>}</div><h3 className="mt-2 font-bold">{item.plan.activityName}</h3><p className="text-sm text-muted-foreground">{item.plan.customerName} · {item.plan.produce} · {item.plan.stationName}</p><p className="mt-1 text-xs text-muted-foreground">Due {item.occurrenceDate}{item.plan.dueTime ? ` at ${item.plan.dueTime}` : ''} · {item.plan.farmZone}</p></div><div className="sm:text-right"><p className="text-2xl font-bold">{item.acceptedPackedBoxes}/{item.plan.targetBoxes}</p><p className="text-xs text-muted-foreground">accepted boxes packed</p>{item.plan.shipmentRequired && <p className="mt-1 text-sm font-semibold text-purple-700">{item.shippedBoxes}/{item.plan.targetBoxes} shipped</p>}</div></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-green-600" style={{ width: `${Math.min(100, item.acceptedPackedBoxes / item.plan.targetBoxes * 100)}%` }} /></div><div className="mt-4 flex flex-wrap gap-2"><Button size="sm" disabled={!item.remainingToPack} onClick={() => openPacking(item)}><Boxes className="mr-2 h-4 w-4" />{item.acceptedPackedBoxes ? 'Add packing' : 'Start packing'}</Button>{item.plan.shipmentRequired && <Button size="sm" variant="outline" disabled={item.acceptedPackedBoxes - item.shippedBoxes <= 0} onClick={() => openShipping(item)}><Truck className="mr-2 h-4 w-4" />Ship available</Button>}{canManage && <Button size="sm" variant="ghost" onClick={() => openPlan(item.plan)}><Edit3 className="mr-2 h-4 w-4" />Edit schedule</Button>}</div></CardContent></Card>)}{openWork.length === 0 && <Card className="xl:col-span-2"><CardContent className="py-12 text-center"><CheckCircle2 className="mx-auto mb-3 h-9 w-9 text-green-600" /><p className="font-semibold">No work is waiting</p><p className="mt-1 text-sm text-muted-foreground">Scheduled work will appear here for the assigned station.</p>{canManage && <Button className="mt-4" onClick={() => openPlan()}>Schedule packing work</Button>}</CardContent></Card>}</div>{completed.length > 0 && <div><h3 className="mb-2 text-sm font-semibold text-muted-foreground">Recently completed</h3><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{completed.map(item => <div key={item.key} className="rounded-lg border bg-green-50/40 p-3"><p className="font-semibold">{item.plan.activityName}</p><p className="text-xs text-muted-foreground">{item.occurrenceDate} · {item.plan.targetBoxes} boxes</p></div>)}</div></div>}</section>}

    {tab === 'packing' && <section className="space-y-3">
      {packingRecords.map(record => {
        const uninspected = Boolean(record.inspectionStatus && (record.inspectedBoxes ?? 0) === 0);
        return <Card key={record.id}><CardContent className="p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{record.stationName}</p><Badge variant="secondary">{record.shift}</Badge><Badge variant="outline">{record.produce}</Badge>{record.inspectionStatus && <Badge variant="outline">{record.inspectionStatus.replaceAll('_', ' ')}</Badge>}{record.fulfilmentPlanId && <Badge>Scheduled</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">{record.date} · {record.supervisorName} · {record.farmZone}</p>{record.customerName && <p className="text-xs text-muted-foreground">Customer: {record.customerName}</p>}{record.workers.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Workers: {record.workers.join(', ')}</p>}</div><div className="flex flex-col items-start gap-2 lg:items-end"><div className="lg:text-right"><p className="text-2xl font-bold text-green-700">{acceptedPackingBoxes(record)}</p><p className="text-xs text-muted-foreground">accepted of {record.packedBoxes} packed{record.reworkBoxes ? ` · ${record.reworkBoxes} rework` : ''}{record.rejectedBoxes ? ` · ${record.rejectedBoxes} rejected` : ''}</p></div><div className="flex flex-wrap gap-1"><Button size="sm" variant="outline" onClick={() => openPacking(undefined, record)}><Copy className="mr-1 h-3.5 w-3.5" />Copy</Button>{canManage && uninspected && <Button size="sm" variant="outline" onClick={() => openPackingEdit(record)}><Edit3 className="mr-1 h-3.5 w-3.5" />Edit</Button>}{canManage && uninspected && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => void removePacking(record)}><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</Button>}{canManage && !uninspected && record.inspectionStatus && <Button size="sm" variant="outline" onClick={() => { setQualityInitialSection('audit'); setTab('quality'); }}><ShieldCheck className="mr-1 h-3.5 w-3.5" />Quality correction</Button>}</div></div></div></CardContent></Card>;
      })}
      {packingRecords.length === 0 && <div className="rounded-xl border py-12 text-center text-sm text-muted-foreground">No packing records yet.</div>}
    </section>}
    {tab === 'shipping' && <section className="space-y-3">{shippingRecords.map(record => <Card key={record.id}><CardContent className="p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><Truck className="h-4 w-4 text-purple-700" /><p className="font-semibold">{record.destinationName}</p>{record.fulfilmentPlanId && <Badge>Scheduled</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">{record.produce} · {record.dispatchDate}</p><p className="text-xs text-muted-foreground">From {record.stationName || 'Unassigned'}{record.storageName ? ` · ${record.storageName}` : ''}</p>{record.driverName && <p className="text-xs text-muted-foreground">{record.driverName}{record.vehicleId ? ` · ${record.vehicleId}` : ''}</p>}</div><div className="flex items-start gap-3 sm:text-right"><div><p className="text-2xl font-bold text-purple-700">{record.boxesShipped}</p><p className="text-xs text-muted-foreground">boxes shipped</p></div><Button size="sm" variant="outline" onClick={() => openShipping(undefined, record)}><Copy className="mr-2 h-4 w-4" />Copy details</Button></div></div></CardContent></Card>)}{shippingRecords.length === 0 && <div className="rounded-xl border py-12 text-center text-sm text-muted-foreground">No shipments logged yet.</div>}</section>}
    {tab === 'shipping' && shippingRecords.some(record => record.allocations?.length) && <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-green-700" />Shipment lot traceability</CardTitle></CardHeader><CardContent className="space-y-2">{shippingRecords.filter(record => record.allocations?.length).map(record => <div key={`trace-${record.id}`} className="rounded-lg border p-3"><p className="font-semibold">{record.destinationName} · {record.dispatchDate}</p><div className="mt-2 flex flex-wrap gap-2">{record.allocations!.map(allocation => <Badge key={`${record.id}-${allocation.packingRecordId}`} variant="outline">{allocation.lotNumber}: {allocation.boxes} boxes{allocation.qualityGrade ? ` · ${allocation.qualityGrade}` : ''}{allocation.palletId ? ` · Pallet ${allocation.palletId}` : ''}</Badge>)}</div></div>)}</CardContent></Card>}

    {tab === 'setup' && canManage && <section className="space-y-5"><Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle className="text-base">Packing schedules</CardTitle><p className="mt-1 text-sm text-muted-foreground">One-off and recurring customer or production targets.</p></div><Button size="sm" onClick={() => openPlan()}><Plus className="mr-2 h-4 w-4" />New schedule</Button></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{agric.packingPlans.map(item => <div key={item.id} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{item.activityName}</p><p className="text-xs text-muted-foreground">{item.customerName} · {item.targetBoxes} {item.produce} boxes</p><p className="mt-1 text-xs text-muted-foreground">{item.startDate} · {item.recurrence} · {item.stationName}</p></div><Badge variant={item.status === 'active' ? 'default' : 'secondary'}>{item.status}</Badge></div><div className="mt-3 flex flex-wrap gap-1"><Button size="sm" variant="ghost" onClick={() => openPlan(item)}><Edit3 className="mr-1 h-3.5 w-3.5" />Edit</Button><Button size="sm" variant="ghost" onClick={() => openPlan(item, true)}><Copy className="mr-1 h-3.5 w-3.5" />Duplicate</Button><Button size="sm" variant="ghost" onClick={() => void agric.setPackingPlanStatus(item.id, item.status === 'active' ? 'paused' : 'active')}>{item.status === 'active' ? <Pause className="mr-1 h-3.5 w-3.5" /> : <Play className="mr-1 h-3.5 w-3.5" />}{item.status === 'active' ? 'Pause' : 'Activate'}</Button><Button size="sm" variant="ghost" onClick={() => void agric.setPackingPlanStatus(item.id, 'archived')}><Archive className="mr-1 h-3.5 w-3.5" />Archive</Button></div></div>)}{agric.packingPlans.length === 0 && <p className="col-span-full py-6 text-center text-sm text-muted-foreground">No schedules configured.</p>}</CardContent></Card>
      <div className="grid gap-5 xl:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" />Saved packing teams</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><div><Label>Team name</Label><Input className="mt-1" value={crew.name} onChange={event => setCrew(current => ({ ...current, name: event.target.value }))} placeholder="Morning packing team" /></div><div><Label>Workers</Label><Input className="mt-1" value={crew.workers} onChange={event => setCrew(current => ({ ...current, workers: event.target.value }))} placeholder="Names separated by commas" /></div></div><div className="flex justify-end"><Button size="sm" onClick={() => void saveCrew()}><Save className="mr-2 h-4 w-4" />{crew.id ? 'Update team' : 'Save team'}</Button></div>{agric.packingCrews.map(item => <div key={item.id} className="flex items-start justify-between rounded-lg border p-3"><div><p className="font-semibold">{item.name}</p><p className="text-xs text-muted-foreground">{item.workers.join(', ')}</p></div><div className="flex"><Button size="icon" variant="ghost" aria-label={`Edit ${item.name}`} onClick={() => setCrew({ id: item.id, name: item.name, workers: item.workers.join(', ') })}><Edit3 className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label={`Delete ${item.name}`} onClick={() => window.confirm(`Delete ${item.name}?`) && void agric.deletePackingCrew(item.id)}><Trash2 className="h-4 w-4 text-red-600" /></Button></div></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Truck className="h-4 w-4" />Saved vehicles and drivers</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><div><Label>Label</Label><Input className="mt-1" value={transport.label} onChange={event => setTransport(current => ({ ...current, label: event.target.value }))} placeholder="Export truck" /></div><div><Label>Registration</Label><Input className="mt-1" value={transport.vehicleId} onChange={event => setTransport(current => ({ ...current, vehicleId: event.target.value }))} placeholder="GT 1234-26" /></div><div><Label>Driver</Label><Input className="mt-1" value={transport.driverName} onChange={event => setTransport(current => ({ ...current, driverName: event.target.value }))} /></div></div><div className="flex justify-end"><Button size="sm" onClick={() => void saveTransport()}><Save className="mr-2 h-4 w-4" />{transport.id ? 'Update transport' : 'Save transport'}</Button></div>{agric.packingTransportProfiles.map(item => <div key={item.id} className="flex items-start justify-between rounded-lg border p-3"><div><p className="font-semibold">{item.label}</p><p className="text-xs text-muted-foreground">{item.vehicleId} · {item.driverName}</p></div><div className="flex"><Button size="icon" variant="ghost" aria-label={`Edit ${item.label}`} onClick={() => setTransport({ id: item.id, label: item.label, vehicleId: item.vehicleId, driverName: item.driverName })}><Edit3 className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label={`Delete ${item.label}`} onClick={() => window.confirm(`Delete ${item.label}?`) && void agric.deletePackingTransport(item.id)}><Trash2 className="h-4 w-4 text-red-600" /></Button></div></div>)}</CardContent></Card></div>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]"><Card><CardHeader><CardTitle className="text-base">{station.id ? 'Edit station' : 'Add station / storage'}</CardTitle></CardHeader><CardContent className="space-y-3"><div><Label>Station name</Label><Input className="mt-1" value={station.name} onChange={event => setStation(current => ({ ...current, name: event.target.value }))} /></div><div><Label>Storage / reefer</Label><Input className="mt-1" value={station.storageName} onChange={event => setStation(current => ({ ...current, storageName: event.target.value }))} /></div><div><Label>Assigned users</Label><div className="mt-1 max-h-48 overflow-auto rounded-lg border p-2">{teamMembers.map(member => <label key={member.id} className="flex cursor-pointer gap-2 rounded p-2 text-sm hover:bg-muted"><input type="checkbox" checked={station.assignedUserIds.includes(member.id)} onChange={() => setStation(current => ({ ...current, assignedUserIds: current.assignedUserIds.includes(member.id) ? current.assignedUserIds.filter(id => id !== member.id) : [...current.assignedUserIds, member.id] }))} /><span><span className="block font-medium">{member.name}</span><span className="text-xs text-muted-foreground">{member.email}</span></span></label>)}</div></div><div className="flex gap-2">{station.id && <Button variant="outline" className="flex-1" onClick={() => setStation({ id: '', name: '', storageName: '', assignedUserIds: [] })}>Cancel</Button>}<Button className="flex-1" onClick={() => void saveStation()}>{station.id ? 'Save changes' : 'Add station'}</Button></div></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Configured stations</CardTitle></CardHeader><CardContent className="space-y-2">{activeStations.map(item => <div key={item.id} className="flex items-start justify-between rounded-lg border p-3"><div><p className="font-semibold">{item.name}</p><p className="text-xs text-muted-foreground">{item.storageName || 'No storage set'}</p><p className="text-xs text-muted-foreground">{item.assignedUserNames?.length ? `Assigned: ${item.assignedUserNames.join(', ')}` : 'No users assigned'}</p></div><div className="flex"><Button size="icon" variant="ghost" aria-label={`Edit ${item.name}`} onClick={() => setStation({ id: item.id, name: item.name, storageName: item.storageName || '', assignedUserIds: item.assignedUserIds || [] })}><Edit3 className="h-4 w-4" /></Button>{!item.id.startsWith('packing-station-') && <Button size="icon" variant="ghost" aria-label={`Delete ${item.name}`} onClick={() => organization?.id && window.confirm(`Delete ${item.name}?`) && void deleteDoc(doc(db, `organizations/${organization.id}/agric_packing_stations/${item.id}`))}><Trash2 className="h-4 w-4 text-red-600" /></Button>}</div></div>)}</CardContent></Card></div>
    </section>}

    {tab === 'quality' && <PackingQualityPanel records={packingRecords} events={agric.packingQualityEvents.filter(event => canManage || visibleIds.has(event.stationId))} config={agric.packingQualityConfig} stations={visibleStations} userId={userId} userName={userName} canManage={canManage} initialSection={qualityInitialSection} shippedBoxesByRecord={shippedBoxesByPackingRecord} onRecord={agric.recordPackingQuality} onSaveConfig={agric.savePackingQualitySettings} />}

    {planOpen && <Modal title={plan.id ? 'Edit packing schedule' : 'Schedule packing work'} onClose={() => setPlanOpen(false)}><div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><div className="sm:col-span-2"><Label>Activity / order *</Label><Input className="mt-1" value={plan.activityName} onChange={event => setPlan(current => ({ ...current, activityName: event.target.value }))} placeholder="Weekly export order" /></div><div><Label>Customer / recipient *</Label><Input className="mt-1" value={plan.customerName} onChange={event => setPlan(current => ({ ...current, customerName: event.target.value }))} /></div><div><Label>Destination</Label><Input className="mt-1" value={plan.destinationName} onChange={event => setPlan(current => ({ ...current, destinationName: event.target.value }))} /></div><div><Label>Station *</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={plan.stationId} onChange={event => setPlan(current => ({ ...current, stationId: event.target.value }))}><option value="">Select station</option>{activeStations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div><Label>Farm area</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={plan.farmZone} onChange={event => setPlan(current => ({ ...current, farmZone: event.target.value }))}>{farmZones.map(item => <option key={item} value={item}>{item}</option>)}</select></div><div><Label>Produce</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={plan.produce} onChange={event => setPlan(current => ({ ...current, produce: event.target.value }))}>{produceTypes.map(item => <option key={item} value={item}>{item}</option>)}</select></div><div><Label>Target boxes *</Label><Input className="mt-1" type="number" min="1" value={plan.targetBoxes || ''} onChange={event => setPlan(current => ({ ...current, targetBoxes: Number(event.target.value) || 0 }))} /></div><div><Label>Due date *</Label><Input className="mt-1" type="date" value={plan.startDate} onChange={event => setPlan(current => ({ ...current, startDate: event.target.value }))} /></div><div><Label>Due time</Label><Input className="mt-1" type="time" value={plan.dueTime} onChange={event => setPlan(current => ({ ...current, dueTime: event.target.value }))} /></div><div><Label>Repeat</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={plan.recurrence} onChange={event => setPlan(current => ({ ...current, recurrence: event.target.value as PlanForm['recurrence'] }))}><option value="none">One time</option><option value="weekly">Every week</option><option value="biweekly">Every two weeks</option><option value="monthly">Every month</option></select></div>{plan.recurrence !== 'none' && <div><Label>Repeat until</Label><Input className="mt-1" type="date" min={plan.startDate} value={plan.endDate} onChange={event => setPlan(current => ({ ...current, endDate: event.target.value }))} /></div>}<div><Label>Saved team</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={plan.crewProfileId} onChange={event => setPlan(current => ({ ...current, crewProfileId: event.target.value }))}><option value="">Choose during packing</option>{agric.packingCrews.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div><Label>Vehicle / driver</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={plan.transportProfileId} onChange={event => setPlan(current => ({ ...current, transportProfileId: event.target.value }))}><option value="">Choose during shipping</option>{agric.packingTransportProfiles.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div></div><label className="flex cursor-pointer gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={plan.shipmentRequired} onChange={event => setPlan(current => ({ ...current, shipmentRequired: event.target.checked }))} /><span><span className="block font-semibold">Shipment required</span><span className="text-xs text-muted-foreground">Keep this work open until its packed target is dispatched.</span></span></label><div><Label>Instructions</Label><Input className="mt-1" value={plan.notes} onChange={event => setPlan(current => ({ ...current, notes: event.target.value }))} /></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPlanOpen(false)}>Cancel</Button><Button onClick={() => void submitPlan()}><Save className="mr-2 h-4 w-4" />Save schedule</Button></div></div></Modal>}

    {packingOpen && <Modal title={editingPackingId ? 'Correct packing record' : 'Record packing progress'} onClose={() => { setPackingOpen(false); setEditingPackingId(null); }}>
      <div className="space-y-4">
        {packing.fulfilmentPlanId && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm"><p className="font-semibold">Linked to scheduled work</p><p className="text-xs text-muted-foreground">{packing.customerName} · due {packing.fulfilmentOccurrenceDate} · target {packing.targetBoxes} boxes. Save as many partial sessions as needed.</p></div>}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><ShieldCheck className="mr-2 inline h-4 w-4" />Record physical output here. Package acceptance, rework, and rejection are recorded separately in Quality.</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Station *</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={packing.stationId || selectedPackingStation?.id || ''} onChange={event => setPacking(current => ({ ...current, stationId: event.target.value }))}>{visibleStations.map(item => <option key={item.id} value={item.id}>{item.name}{item.storageName ? ` (${item.storageName})` : ''}</option>)}</select></div>
          <div><Label>Date</Label><Input className="mt-1" type="date" value={packing.date || today} onChange={event => setPacking(current => ({ ...current, date: event.target.value }))} /></div>
          <div><Label>Shift</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={packing.shift} onChange={event => setPacking(current => ({ ...current, shift: event.target.value as PackingRecord['shift'] }))}>{SHIFTS.map(item => <option key={item} value={item}>{item.charAt(0).toUpperCase() + item.slice(1)}</option>)}</select></div>
          <div><Label>Produce</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={packing.produce} onChange={event => setPacking(current => ({ ...current, produce: event.target.value }))}>{produceTypes.map(item => <option key={item} value={item}>{item}</option>)}</select></div>
          <div><Label>Farm area</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={packing.farmZone} onChange={event => setPacking(current => ({ ...current, farmZone: event.target.value as FarmZone }))}>{farmZones.map(item => <option key={item} value={item}>{item}</option>)}</select></div>
          <div><Label>Target</Label><Input className="mt-1" type="number" min="0" disabled={Boolean(packing.fulfilmentPlanId)} value={packing.targetBoxes || ''} onChange={event => setPacking(current => ({ ...current, targetBoxes: Number(event.target.value) || 0 }))} /></div>
          <div><Label>Packed boxes *</Label><Input className="mt-1" type="number" min="1" value={packing.packedBoxes || ''} onChange={event => setPacking(current => ({ ...current, packedBoxes: Number(event.target.value) || 0 }))} /></div>
          <div><Label>Gross packed weight (kg)</Label><Input className="mt-1" type="number" min="0" step="0.01" value={packing.totalWeight || ''} onChange={event => setPacking(current => ({ ...current, totalWeight: Number(event.target.value) || 0 }))} /></div>
          <div><Label>Saved team</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value="" onChange={event => { const saved = agric.packingCrews.find(item => item.id === event.target.value); if (saved) setWorkersInput(saved.workers.join(', ')); }}><option value="">Select saved team</option>{agric.packingCrews.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
          <div className="sm:col-span-2"><Label>Workers</Label><Input className="mt-1" value={workersInput} onChange={event => setWorkersInput(event.target.value)} placeholder="Names separated by commas" />{recentCrews.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{recentCrews.map(item => <Button key={item.id} size="sm" variant="outline" onClick={() => setWorkersInput(item.workers.join(', '))}><Copy className="mr-1 h-3.5 w-3.5" />Reuse {item.workers.length}-person team</Button>)}</div>}</div>
          <div className="sm:col-span-2"><Label>Notes</Label><Input className="mt-1" value={packing.notes || ''} onChange={event => setPacking(current => ({ ...current, notes: event.target.value }))} /></div>
        </div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setPackingOpen(false); setEditingPackingId(null); }}>Cancel</Button><Button onClick={() => void submitPacking()}><Boxes className="mr-2 h-4 w-4" />{editingPackingId ? 'Save correction' : 'Save progress'}</Button></div>
      </div>
    </Modal>}

    {shippingOpen && <Modal title="Log shipment" onClose={() => setShippingOpen(false)}><div className="space-y-4"><div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm"><Package className="mr-2 inline h-4 w-4" />Shipping deducts only from verified stock at the selected station.</div>{shipping.fulfilmentPlanId && <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm">Linked partial shipments accumulate until the scheduled target is dispatched.</div>}<div className="grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><Label>Destination *</Label><Input className="mt-1" value={shipping.destinationName || ''} onChange={event => setShipping(current => ({ ...current, destinationName: event.target.value }))} /></div><div><Label>Source station *</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={shipping.stationId || selectedShippingStation?.id || ''} onChange={event => setShipping(current => ({ ...current, stationId: event.target.value }))}>{visibleStations.map(item => <option key={item.id} value={item.id}>{item.name}{item.storageName ? ` (${item.storageName})` : ''}</option>)}</select></div><div><Label>Produce</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value={shipping.produce} onChange={event => setShipping(current => ({ ...current, produce: event.target.value }))}>{produceTypes.map(item => <option key={item} value={item}>{item}</option>)}</select><p className="mt-1 text-xs text-muted-foreground">Available here: {available} boxes</p></div><div><Label>Boxes shipped *</Label><Input className="mt-1" type="number" min="1" max={available} value={shipping.boxesShipped || ''} onChange={event => setShipping(current => ({ ...current, boxesShipped: Number(event.target.value) || 0 }))} /></div><div><Label>Weight (kg)</Label><Input className="mt-1" type="number" min="0" step="0.01" value={shipping.weightShipped || ''} onChange={event => setShipping(current => ({ ...current, weightShipped: Number(event.target.value) || 0 }))} /></div><div className="sm:col-span-2"><Label>Saved vehicle and driver</Label><select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm" value="" onChange={event => { const saved = agric.packingTransportProfiles.find(item => item.id === event.target.value); if (saved) setShipping(current => ({ ...current, vehicleId: saved.vehicleId, driverName: saved.driverName })); }}><option value="">Select saved transport</option>{agric.packingTransportProfiles.map(item => <option key={item.id} value={item.id}>{item.label} · {item.vehicleId} · {item.driverName}</option>)}</select></div><div><Label>Vehicle registration</Label><Input className="mt-1" value={shipping.vehicleId || ''} onChange={event => { const vehicleId = event.target.value; const saved = agric.packingTransportProfiles.find(item => item.vehicleId.trim().toLowerCase() === vehicleId.trim().toLowerCase()); const previous = shippingRecords.find(item => item.vehicleId?.trim().toLowerCase() === vehicleId.trim().toLowerCase()); setShipping(current => ({ ...current, vehicleId, driverName: saved?.driverName || previous?.driverName || current.driverName })); }} /></div><div><Label>Driver</Label><Input className="mt-1" value={shipping.driverName || ''} onChange={event => setShipping(current => ({ ...current, driverName: event.target.value }))} /></div><div><Label>Invoice / reference</Label><Input className="mt-1" value={shipping.invoiceNumber || ''} onChange={event => setShipping(current => ({ ...current, invoiceNumber: event.target.value }))} /></div><div><Label>Dispatch date</Label><Input className="mt-1" type="date" value={shipping.dispatchDate || today} onChange={event => setShipping(current => ({ ...current, dispatchDate: event.target.value }))} /></div><div className="sm:col-span-2"><Label>Notes</Label><Input className="mt-1" value={shipping.notes || ''} onChange={event => setShipping(current => ({ ...current, notes: event.target.value }))} /></div></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShippingOpen(false)}>Cancel</Button><Button onClick={() => void submitShipping()}><Truck className="mr-2 h-4 w-4" />Log shipment</Button></div></div></Modal>}
  </div>;
}
