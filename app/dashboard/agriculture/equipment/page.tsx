'use client';

import { useState } from 'react';
import {
  Tractor, Plus, Clock, CheckCircle2, AlertTriangle,
  User, X, Search, Package
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/lib/store';
import { useAgric } from '@/lib/agric/useAgric';
import { EquipmentCheckout, FarmZone } from '@/lib/agric/types';
import { getAgricultureProfile } from '@/lib/agric/config';

export default function EquipmentPage() {
  const { checkouts, inventory, checkout: checkoutItem, returnItem } = useAgric();
  const { user, organization } = useAppStore();
  const equipmentItems = inventory.filter(i => i.category === 'equipment' && i.isActive);
  const farmZones = getAgricultureProfile(organization?.settings).farmZones.length ? getAgricultureProfile(organization?.settings).farmZones : ['Main Farm'];
  const currentUserName = user?.name ?? 'Supervisor';
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'out' | 'overdue' | 'returned'>('all');
  const [showCheckout, setShowCheckout] = useState(false);
  const [newCheckout, setNewCheckout] = useState<Partial<EquipmentCheckout>>({
    farmZone: farmZones[0] as FarmZone, supervisorName: currentUserName, supervisorId: user?.id ?? 's01'
  });

  function filtered() {
    return checkouts.filter(c => {
      const matchSearch = c.itemName.toLowerCase().includes(search.toLowerCase()) ||
        c.checkoutBy.toLowerCase().includes(search.toLowerCase()) ||
        c.farmZone.toLowerCase().includes(search.toLowerCase());
      const matchFilter = filter === 'all' ||
        (filter === 'out' && !c.isReturned && !c.isOverdue) ||
        (filter === 'overdue' && c.isOverdue && !c.isReturned) ||
        (filter === 'returned' && c.isReturned);
      return matchSearch && matchFilter;
    });
  }

  async function handleReturn(id: string, condition: 'good' | 'damaged' | 'lost') {
    await returnItem(id, condition);
  }

  async function submitCheckout() {
    if (!newCheckout.itemId || !newCheckout.checkoutBy || !newCheckout.farmZone) return;
    const invItem = equipmentItems.find(i => i.id === newCheckout.itemId);
    if (!invItem) return;
    await checkoutItem({
      itemId: invItem.id, itemName: invItem.name,
      checkoutBy: newCheckout.checkoutBy!, checkoutById: `w_${Date.now()}`,
      checkoutTime: new Date().toISOString(),
      expectedReturnTime: newCheckout.expectedReturnTime,
      supervisorId: newCheckout.supervisorId || 's01',
      supervisorName: newCheckout.supervisorName || 'Supervisor',
      farmZone: newCheckout.farmZone as FarmZone,
      purpose: newCheckout.purpose,
      isReturned: false, isOverdue: false,
    });
    setNewCheckout({ farmZone: farmZones[0] as FarmZone, supervisorName: currentUserName, supervisorId: user?.id ?? 'user' });
    setShowCheckout(false);
  }

  const stats = {
    out: checkouts.filter(c => !c.isReturned && !c.isOverdue).length,
    overdue: checkouts.filter(c => c.isOverdue && !c.isReturned).length,
    returned: checkouts.filter(c => c.isReturned).length,
  };

  const displayItems = filtered();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Equipment Tracking</h1>
          <p className="text-muted-foreground text-sm">Track all farm tools and equipment in real time — who has what, when it was taken, and when returned</p>
        </div>
        <Button className="bg-green-600 hover:bg-green-700" onClick={() => setShowCheckout(true)}>
          <Plus className="w-4 h-4 mr-1" /> Checkout Item
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-blue-500 cursor-pointer" onClick={() => setFilter('out')}>
          <CardContent className="pt-4">
            <p className="text-3xl font-bold text-blue-600">{stats.out}</p>
            <p className="text-sm text-muted-foreground">Currently Out</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500 cursor-pointer" onClick={() => setFilter('overdue')}>
          <CardContent className="pt-4">
            <p className="text-3xl font-bold text-red-600">{stats.overdue}</p>
            <p className="text-sm text-muted-foreground">Overdue Returns</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500 cursor-pointer" onClick={() => setFilter('returned')}>
          <CardContent className="pt-4">
            <p className="text-3xl font-bold text-green-600">{stats.returned}</p>
            <p className="text-sm text-muted-foreground">Returned Today</p>
          </CardContent>
        </Card>
      </div>

      {/* Overdue Alert */}
      {stats.overdue > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          <p className="text-sm text-red-800 font-medium">
            {stats.overdue} item{stats.overdue > 1 ? 's are' : ' is'} overdue for return. Follow up with the workers.
          </p>
        </div>
      )}

      {/* Equipment Inventory Summary */}
      <Card>
        <CardHeader className="py-4">
          <CardTitle className="text-base">Equipment Inventory</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {equipmentItems.map(item => {
              const outCount = checkouts.filter(c => c.itemId === item.id && !c.isReturned).length;
              const available = item.currentStock - outCount;
              return (
                <div key={item.id} className="border rounded-lg p-3 text-sm">
                  <p className="font-medium">{item.name}</p>
                  <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                    <span>Total: {item.currentStock}</span>
                    <span>Out: {outCount}</span>
                    <span className={available <= 0 ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>Available: {available}</span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full mt-2 overflow-hidden">
                    <div className={`h-full rounded-full ${available <= 0 ? 'bg-red-500' : available < item.minimumStock ? 'bg-amber-500' : 'bg-green-500'}`}
                      style={{ width: `${Math.max(0, Math.min((available / item.currentStock) * 100, 100))}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by item, worker, or zone..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 border rounded-md p-1 bg-background">
          {[['all', 'All'], ['out', 'Out'], ['overdue', 'Overdue'], ['returned', 'Returned']].map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v as any)} className={`px-3 py-1 rounded text-sm transition-colors ${filter === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{l}</button>
          ))}
        </div>
      </div>

      {/* Checkout Log */}
      <div className="space-y-3">
        {displayItems.map(c => (
          <Card key={c.id} className={c.isOverdue && !c.isReturned ? 'border-red-300 bg-red-50/30' : ''}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${c.isReturned ? 'bg-green-100' : c.isOverdue ? 'bg-red-100' : 'bg-blue-100'}`}>
                    {c.isReturned ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : c.isOverdue ? <AlertTriangle className="w-5 h-5 text-red-600" /> : <Package className="w-5 h-5 text-blue-600" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{c.itemName}</p>
                      {c.isOverdue && !c.isReturned && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">OVERDUE</span>}
                      {c.isReturned && <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full">✓ Returned {c.returnedCondition && `— ${c.returnedCondition}`}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />{c.checkoutBy}</span>
                      <span>·</span>
                      <span>{c.farmZone} Zone</span>
                      {c.purpose && <><span>·</span><span>{c.purpose}</span></>}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Out: {new Date(c.checkoutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {c.expectedReturnTime && <span>Expected: {new Date(c.expectedReturnTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                      {c.returnTime && <span className="text-green-600">Returned: {new Date(c.returnTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                      <span>Supervisor: {c.supervisorName}</span>
                    </div>
                  </div>
                </div>
                {!c.isReturned && (
                  <div className="flex gap-2 flex-shrink-0">
                    <Button size="sm" variant="outline" className="text-xs h-7 border-green-300 text-green-700 hover:bg-green-50" onClick={() => handleReturn(c.id, 'good')}>
                      ✓ Good
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-7 border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => handleReturn(c.id, 'damaged')}>
                      ⚠ Damaged
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-7 border-red-300 text-red-700 hover:bg-red-50" onClick={() => handleReturn(c.id, 'lost')}>
                      ✕ Lost
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {displayItems.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Tractor className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No equipment records found</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Checkout Modal */}
      {showCheckout && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Checkout Equipment <button onClick={() => setShowCheckout(false)}><X className="w-4 h-4" /></button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-sm font-medium">Equipment Item *</label>
                <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={newCheckout.itemId || ''} onChange={e => setNewCheckout(p => ({ ...p, itemId: e.target.value }))}>
                  <option value="">Select item...</option>
                  {equipmentItems.map(i => {
                    const out = checkouts.filter(c => c.itemId === i.id && !c.isReturned).length;
                    const avail = i.currentStock - out;
                    return <option key={i.id} value={i.id} disabled={avail <= 0}>{i.name} ({avail} available)</option>;
                  })}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Worker Name *</label>
                <Input className="mt-1" placeholder="e.g. John Mensah" value={newCheckout.checkoutBy || ''} onChange={e => setNewCheckout(p => ({ ...p, checkoutBy: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium">Farm Zone *</label>
                <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={newCheckout.farmZone} onChange={e => setNewCheckout(p => ({ ...p, farmZone: e.target.value as FarmZone }))}>
                  {farmZones.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Purpose</label>
                <Input className="mt-1" placeholder="e.g. Bush clearing, Spraying..." value={newCheckout.purpose || ''} onChange={e => setNewCheckout(p => ({ ...p, purpose: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium">Expected Return Time</label>
                <Input type="time" className="mt-1" onChange={e => {
                  const today = new Date().toISOString().slice(0, 10);
                  setNewCheckout(p => ({ ...p, expectedReturnTime: `${today}T${e.target.value}:00` }));
                }} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowCheckout(false)}>Cancel</Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={submitCheckout} disabled={!newCheckout.itemId || !newCheckout.checkoutBy}>
                  <Tractor className="w-4 h-4 mr-1" /> Log Checkout
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
