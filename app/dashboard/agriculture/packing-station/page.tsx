'use client';

import { useState } from 'react';
import {
  Boxes, Plus, Truck, ChevronRight, X,
  Target, TrendingUp, Package, CheckCircle2, AlertTriangle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/lib/store';
import { useAgric } from '@/lib/agric/useAgric';
import { PackingRecord, ShippingRecord, FarmZone } from '@/lib/agric/types';
import { getAgricultureProfile } from '@/lib/agric/config';

const STATIONS = ['Packing Station A', 'Packing Station B', 'Packing Station C'];
const PRODUCE_TYPES = ['Banana', 'Okra', 'Papaya', 'Tomato', 'Beans', 'Moringa', 'Passion Fruit'];
const SHIFTS = ['morning', 'afternoon', 'evening'] as const;

export default function PackingStationPage() {
  const today = new Date().toISOString().slice(0, 10);
  const { packingRecords, shippingRecords, addPacking, addShipping } = useAgric();
  const { user, organization } = useAppStore();
  const profile = getAgricultureProfile(organization?.settings);
  const farmZones = profile.farmZones.length ? profile.farmZones : ['Main Farm'];
  const currentUserName = user?.name ?? 'Supervisor';
  const currentUserId = user?.id ?? 's01';
  const [showNewPacking, setShowNewPacking] = useState(false);
  const [showShipping, setShowShipping] = useState(false);
  const [activeTab, setActiveTab] = useState<'packing' | 'shipping'>('packing');

  const [newPacking, setNewPacking] = useState<Partial<PackingRecord>>({
    stationName: 'Packing Station A', farmZone: 'Banana', produce: 'Banana', shift: 'morning',
    date: today, supervisorName: currentUserName, supervisorId: currentUserId, workers: [],
  });
  const [workersInput, setWorkersInput] = useState('');

  const [newShipping, setNewShipping] = useState<Partial<ShippingRecord>>({
    dispatchDate: today, produce: 'Banana', supervisorId: 's02',
  });

  const todayPacking = packingRecords.filter(r => r.date === today);
  const totalPackedToday = todayPacking.reduce((s, r) => s + r.packedBoxes, 0);
  const totalTargetToday = todayPacking.reduce((s, r) => s + r.targetBoxes, 0);
  const totalRejectedToday = todayPacking.reduce((s, r) => s + r.rejectedBoxes, 0);
  const totalShippedToday = shippingRecords.filter(r => r.dispatchDate === today).reduce((s, r) => s + r.boxesShipped, 0);

  // Packed minus shipped = remaining in pack house
  const packHouseStock: Record<string, number> = {};
  packingRecords.forEach(r => { packHouseStock[r.produce] = (packHouseStock[r.produce] || 0) + r.packedBoxes - r.rejectedBoxes; });
  shippingRecords.forEach(r => { packHouseStock[r.produce] = (packHouseStock[r.produce] || 0) - r.boxesShipped; });

  async function submitPacking() {
    if (!newPacking.stationName || !newPacking.produce || !newPacking.packedBoxes) return;
    await addPacking({
      date: newPacking.date || today,
      stationId: `ps_${Date.now()}`,
      stationName: newPacking.stationName!,
      supervisorId: newPacking.supervisorId || 's01',
      supervisorName: newPacking.supervisorName || 'Supervisor',
      farmZone: (newPacking.farmZone as FarmZone) || 'Banana',
      produce: newPacking.produce!,
      targetBoxes: newPacking.targetBoxes || 0,
      packedBoxes: newPacking.packedBoxes!,
      rejectedBoxes: newPacking.rejectedBoxes || 0,
      totalWeight: newPacking.totalWeight,
      shift: (newPacking.shift as any) || 'morning',
      workers: workersInput ? workersInput.split(',').map(w => w.trim()).filter(Boolean) : [],
      notes: newPacking.notes,
    });
    setNewPacking({ stationName: 'Packing Station A', farmZone: 'Banana', produce: 'Banana', shift: 'morning', date: today, supervisorName: currentUserName, supervisorId: currentUserId, workers: [] });
    setWorkersInput('');
    setShowNewPacking(false);
  }

  async function submitShipping() {
    if (!newShipping.produce || !newShipping.boxesShipped || !newShipping.destinationName) return;
    await addShipping({
      dispatchDate: newShipping.dispatchDate || today,
      destinationName: newShipping.destinationName!,
      supervisorId: newShipping.supervisorId || 's01',
      produce: newShipping.produce!,
      boxesShipped: newShipping.boxesShipped!,
      weightShipped: newShipping.weightShipped,
      vehicleId: newShipping.vehicleId,
      driverName: newShipping.driverName,
      invoiceNumber: newShipping.invoiceNumber,
      notes: newShipping.notes,
    });
    setNewShipping({ dispatchDate: today, produce: 'Banana', supervisorId: 's02' });
    setShowShipping(false);
  }

  const packingEfficiency = totalTargetToday > 0 ? Math.round((totalPackedToday / totalTargetToday) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Packing Station</h1>
          <p className="text-muted-foreground text-sm">Record daily packing output · Log shipments (auto-reduces packed stock)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setActiveTab('shipping'); setShowShipping(true); }}>
            <Truck className="w-4 h-4 mr-1" /> Log Shipment
          </Button>
          <Button className="bg-green-600 hover:bg-green-700" onClick={() => { setActiveTab('packing'); setShowNewPacking(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Record Packing
          </Button>
        </div>
      </div>

      {/* Today's KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Packed Today', value: totalPackedToday, unit: 'boxes', color: 'border-l-green-500 text-green-700' },
          { label: 'Target', value: totalTargetToday, unit: 'boxes', color: 'border-l-blue-500 text-blue-700' },
          { label: 'Efficiency', value: `${packingEfficiency}%`, unit: '', color: `border-l-${packingEfficiency >= 90 ? 'green' : packingEfficiency >= 70 ? 'amber' : 'red'}-500 text-${packingEfficiency >= 90 ? 'green' : packingEfficiency >= 70 ? 'amber' : 'red'}-700` },
          { label: 'Shipped Today', value: totalShippedToday, unit: 'boxes', color: 'border-l-purple-500 text-purple-700' },
        ].map(s => (
          <Card key={s.label} className={`border-l-4 ${s.color}`}>
            <CardContent className="pt-4">
              <p className={`text-3xl font-bold`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label} {s.unit}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pack House Stock */}
      <Card>
        <CardHeader className="py-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-500" />
            Pack House Stock (Packed – Shipped)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(packHouseStock).filter(([, v]) => v > 0).map(([produce, count]) => (
              <div key={produce} className="border rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-600">{count}</p>
                <p className="text-sm text-muted-foreground">{produce} boxes</p>
              </div>
            ))}
            {Object.values(packHouseStock).every(v => v <= 0) && (
              <p className="col-span-4 text-muted-foreground text-sm text-center py-4">No stock in pack house</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {[['packing', 'Packing Records'], ['shipping', 'Shipping / Dispatch']].map(([v, l]) => (
          <button key={v} onClick={() => setActiveTab(v as any)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === v ? 'border-green-600 text-green-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{l}</button>
        ))}
      </div>

      {/* Packing Records */}
      {activeTab === 'packing' && (
        <div className="space-y-3">
          {packingRecords.map(rec => {
            const efficiency = rec.targetBoxes > 0 ? Math.round((rec.packedBoxes / rec.targetBoxes) * 100) : 100;
            return (
              <Card key={rec.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{rec.stationName}</p>
                        <span className="text-xs bg-muted px-2 py-0.5 rounded">{rec.shift} shift</span>
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">{rec.produce}</span>
                        <span className="text-xs text-muted-foreground">{rec.farmZone}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Supervisor: {rec.supervisorName} · {rec.date}
                      </p>
                      {rec.workers.length > 0 && (
                        <p className="text-xs text-muted-foreground">Workers: {rec.workers.join(', ')}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-green-600">{rec.packedBoxes}</p>
                      <p className="text-xs text-muted-foreground">of {rec.targetBoxes} target</p>
                      {rec.rejectedBoxes > 0 && <p className="text-xs text-red-500">{rec.rejectedBoxes} rejected</p>}
                      {rec.totalWeight && <p className="text-xs text-muted-foreground">{rec.totalWeight} kg</p>}
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Efficiency</span>
                      <span className={efficiency >= 90 ? 'text-green-600' : efficiency >= 70 ? 'text-amber-600' : 'text-red-600'}>{efficiency}%</span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${efficiency >= 90 ? 'bg-green-500' : efficiency >= 70 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${efficiency}%` }} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Shipping Records */}
      {activeTab === 'shipping' && (
        <div className="space-y-3">
          {shippingRecords.map(rec => (
            <Card key={rec.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-purple-600" />
                      <p className="font-semibold">{rec.destinationName}</p>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{rec.produce} · {rec.dispatchDate}</p>
                    {rec.driverName && <p className="text-xs text-muted-foreground">Driver: {rec.driverName} {rec.vehicleId && `· ${rec.vehicleId}`}</p>}
                    {rec.invoiceNumber && <p className="text-xs text-muted-foreground">Invoice: {rec.invoiceNumber}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-purple-600">{rec.boxesShipped}</p>
                    <p className="text-xs text-muted-foreground">boxes shipped</p>
                    {rec.weightShipped && <p className="text-xs text-muted-foreground">{rec.weightShipped} kg</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {shippingRecords.length === 0 && (
            <div className="text-center py-12 text-muted-foreground border rounded-xl">
              <Truck className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No shipments logged yet</p>
            </div>
          )}
        </div>
      )}

      {/* New Packing Modal */}
      {showNewPacking && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Record Packing Session <button onClick={() => setShowNewPacking(false)}><X className="w-4 h-4" /></button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Station</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={newPacking.stationName} onChange={e => setNewPacking(p => ({ ...p, stationName: e.target.value }))}>
                    {STATIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Shift</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={newPacking.shift} onChange={e => setNewPacking(p => ({ ...p, shift: e.target.value as any }))}>
                    {SHIFTS.map(s => <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Produce</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={newPacking.produce} onChange={e => setNewPacking(p => ({ ...p, produce: e.target.value }))}>
                    {PRODUCE_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Farm Zone</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={newPacking.farmZone} onChange={e => setNewPacking(p => ({ ...p, farmZone: e.target.value as FarmZone }))}>
                    {farmZones.map(z => <option key={z} value={z}>{z}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Target Boxes</label>
                  <Input type="number" className="mt-1" placeholder="300" value={newPacking.targetBoxes || ''} onChange={e => setNewPacking(p => ({ ...p, targetBoxes: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Packed Boxes *</label>
                  <Input type="number" className="mt-1" placeholder="0" value={newPacking.packedBoxes || ''} onChange={e => setNewPacking(p => ({ ...p, packedBoxes: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Rejected Boxes</label>
                  <Input type="number" className="mt-1" placeholder="0" value={newPacking.rejectedBoxes || ''} onChange={e => setNewPacking(p => ({ ...p, rejectedBoxes: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Total Weight (kg)</label>
                  <Input type="number" className="mt-1" placeholder="0" value={newPacking.totalWeight || ''} onChange={e => setNewPacking(p => ({ ...p, totalWeight: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium">Workers (comma separated)</label>
                  <Input className="mt-1" placeholder="John Mensah, Ama Owusu, ..." value={workersInput} onChange={e => setWorkersInput(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium">Notes</label>
                  <Input className="mt-1" placeholder="Any observations..." value={newPacking.notes || ''} onChange={e => setNewPacking(p => ({ ...p, notes: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowNewPacking(false)}>Cancel</Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={submitPacking} disabled={!newPacking.packedBoxes}>
                  <Boxes className="w-4 h-4 mr-1" /> Save Record
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Shipping Modal */}
      {showShipping && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Log Shipment <button onClick={() => setShowShipping(false)}><X className="w-4 h-4" /></button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                📦 Shipping automatically reduces pack house stock for the selected produce.
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-sm font-medium">Destination *</label>
                  <Input className="mt-1" placeholder="e.g. Fresh Farms Export GmbH, Hamburg" value={newShipping.destinationName || ''} onChange={e => setNewShipping(p => ({ ...p, destinationName: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Produce</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={newShipping.produce} onChange={e => setNewShipping(p => ({ ...p, produce: e.target.value }))}>
                    {PRODUCE_TYPES.map(p => <option key={p} value={p}>{p} (stock: {packHouseStock[p] || 0} boxes)</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Boxes Shipped *</label>
                  <Input type="number" className="mt-1" placeholder="0" value={newShipping.boxesShipped || ''} onChange={e => setNewShipping(p => ({ ...p, boxesShipped: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Weight (kg)</label>
                  <Input type="number" className="mt-1" placeholder="0" value={newShipping.weightShipped || ''} onChange={e => setNewShipping(p => ({ ...p, weightShipped: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Driver Name</label>
                  <Input className="mt-1" placeholder="Driver name" value={newShipping.driverName || ''} onChange={e => setNewShipping(p => ({ ...p, driverName: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Vehicle ID</label>
                  <Input className="mt-1" placeholder="e.g. GH-8844-12" value={newShipping.vehicleId || ''} onChange={e => setNewShipping(p => ({ ...p, vehicleId: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Invoice No.</label>
                  <Input className="mt-1" placeholder="INV-2026-..." value={newShipping.invoiceNumber || ''} onChange={e => setNewShipping(p => ({ ...p, invoiceNumber: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowShipping(false)}>Cancel</Button>
                <Button className="flex-1 bg-purple-600 hover:bg-purple-700" onClick={submitShipping} disabled={!newShipping.boxesShipped || !newShipping.destinationName}>
                  <Truck className="w-4 h-4 mr-1" /> Log Shipment
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
