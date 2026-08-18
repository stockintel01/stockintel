'use client';

import { useState } from 'react';
import type { ElementType } from 'react';
import {
  Plus, Search, CheckCircle2, Clock, XCircle, Truck,
  Package, X
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/lib/store';
import { useAgric } from '@/lib/agric/useAgric';
import { StockRequest, StockRequestItem, RequestStatus, FarmZone, AgricCategory, UserRole, UOM } from '@/lib/agric/types';
import { getAgricultureProfile } from '@/lib/agric/config';
import { compatibleUnitsForItem, convertItemQuantity, formatQuantity } from '@/lib/agric/units';
import { userHasAccess } from '@/lib/access-permissions';
import { awaitingReceipt, remainingToDispatch, remainingToReceive } from '@/lib/agric/request-fulfillment';

const STATUS_CONFIG: Record<RequestStatus, { label: string; color: string; icon: ElementType }> = {
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock },
  approved: { label: 'Approved', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: CheckCircle2 },
  partially_fulfilled: { label: 'Partially Fulfilled', color: 'bg-cyan-100 text-cyan-800 border-cyan-200', icon: Package },
  dispatched: { label: 'Dispatched', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: Truck },
  received: { label: 'Received', color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
};

export default function RequestsPage() {
  const { requests, inventory, approveRequest, rejectRequest, dispatchReq, confirmReceived, createRequest } = useAgric();
  const { user, organization } = useAppStore();
  const farmZones = getAgricultureProfile(organization?.settings).farmZones.length ? getAgricultureProfile(organization?.settings).farmZones : ['Main Farm'];
  const currentUserName = user?.name ?? 'Farm Manager';
  const currentUserId = user?.id ?? 'user';
  const canApproveRequests = !!user && ['super_admin', 'owner', 'manager'].includes(user.role) && userHasAccess(user, 'agricRequests');
  const canFulfillRequests = !!user && userHasAccess(user, 'agricRequests') && userHasAccess(user, 'agricStock');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RequestStatus | 'all'>('all');
  const [selectedRequest, setSelectedRequest] = useState<StockRequest | null>(null);
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [dispatchQuantities, setDispatchQuantities] = useState<Record<string, number>>({});

  // New request state
  const [newReq, setNewReq] = useState<Partial<StockRequest>>({
    farmZone: farmZones[0] as FarmZone, priority: 'normal', items: []
  });
  const [newReqItem, setNewReqItem] = useState<Partial<StockRequestItem>>({});

  const filtered = requests.filter(r => {
    const matchSearch = (r.requestNumber ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (r.requestedByName ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (r.farmZone ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    partial: requests.filter(r => r.status === 'partially_fulfilled').length,
    dispatched: requests.filter(r => r.status === 'dispatched').length,
    received: requests.filter(r => r.status === 'received').length,
  };

  function openRequest(request: StockRequest) {
    setActionError('');
    setActionMessage('');
    setSelectedRequest(request);
    setDispatchQuantities(Object.fromEntries(request.items.map(item => {
      const remaining = remainingToDispatch(item);
      const available = inventory.find(stock => stock.id === item.itemId)?.currentStock ?? 0;
      return [item.itemId, Math.min(remaining, available)];
    })));
  }

  async function runAction(action: () => Promise<void>, message: string) {
    setIsWorking(true);
    setActionError('');
    setActionMessage('');
    try {
      await action();
      setActionMessage(message);
      setSelectedRequest(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The request could not be updated.');
    } finally {
      setIsWorking(false);
    }
  }

  async function handleApprove(reqId: string) {
    await runAction(() => approveRequest(reqId), 'Request approved and added to the stockkeeper queue.');
  }

  async function handleReject(reqId: string, reason: string) {
    await runAction(() => rejectRequest(reqId, reason), 'Request rejected.');
  }

  async function handleDispatch(req: StockRequest) {
    const items = req.items.map(item => ({ itemId: item.itemId, qty: Number(dispatchQuantities[item.itemId] ?? 0) })).filter(item => item.qty > 0);
    await runAction(() => dispatchReq(req.id, items), 'Dispatch recorded. Any outstanding quantity remains in the fulfillment queue.');
  }

  async function handleMarkReceived(reqId: string) {
    await runAction(() => confirmReceived(reqId), 'Receipt recorded. Any outstanding quantity remains open.');
  }

  function addNewReqItem() {
    setActionError('');
    if (!newReqItem.itemId || !newReqItem.requestedQty || newReqItem.requestedQty <= 0) {
      setActionError('Choose an item and enter a quantity greater than zero.');
      return;
    }
    const invItem = inventory.find(i => i.id === newReqItem.itemId);
    if (!invItem) {
      setActionError('The selected stock item is no longer available.');
      return;
    }
    if ((newReq.items ?? []).some(item => item.itemId === invItem.id)) {
      setActionError(`${invItem.name} is already on this request. Remove it first if you need to change the quantity.`);
      return;
    }
    const requestedUom = newReqItem.requestedUom ?? invItem.uom;
    let requestedQtyInStockUom: number;
    try {
      requestedQtyInStockUom = convertItemQuantity(newReqItem.requestedQty, requestedUom, invItem.uom, invItem.packSize);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'This unit cannot be converted for the selected item.');
      return;
    }
    const item: StockRequestItem = {
      itemId: invItem.id, itemName: invItem.name, category: invItem.category as AgricCategory,
      requestedQty: newReqItem.requestedQty,
      requestedUom,
      requestedQtyInStockUom,
      uom: invItem.uom,
      note: newReqItem.note
    };
    setNewReq(prev => ({ ...prev, items: [...(prev.items || []), item] }));
    setNewReqItem({});
  }

  async function submitNewRequest() {
    if (!newReq.farmZone || !newReq.items?.length || isWorking) return;
    const requestedByRole: UserRole = user?.role === 'worker' ? 'worker' : user?.role === 'manager' ? 'farm_manager' : 'admin';
    setIsWorking(true);
    setActionError('');
    try {
      await createRequest({
        requestNumber: '', requestedBy: currentUserId, requestedByName: currentUserName,
        requestedByRole,
        requestDate: new Date().toISOString(),
        farmZone: newReq.farmZone as FarmZone, priority: newReq.priority ?? 'normal',
        items: newReq.items!, status: 'pending', note: newReq.note?.trim() || undefined,
        requiredByDate: newReq.requiredByDate || undefined,
      });
      setNewReq({ farmZone: farmZones[0] as FarmZone, priority: 'normal', items: [] });
      setShowNewRequest(false);
      setActionMessage('Request submitted. Managers and stockkeepers can now see it in their queue.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The request could not be submitted.');
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Stock Requests</h1>
          <p className="text-muted-foreground text-sm">Request farm supplies, approve fulfillment, and track dispatch to receipt.</p>
        </div>
        <Button className="bg-green-600 hover:bg-green-700" onClick={() => { setActionError(''); setActionMessage(''); setShowNewRequest(true); }}>
          <Plus className="w-4 h-4 mr-1" /> New Request
        </Button>
      </div>

      {actionMessage && <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{actionMessage}</div>}
      {actionError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{actionError}</div>}

      {canFulfillRequests && (
        <Card className="border-blue-200 bg-blue-50/60">
          <CardContent className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-blue-950">Stockkeeper fulfillment queue</p>
              <p className="text-sm text-blue-800">{stats.approved + stats.partial} request{stats.approved + stats.partial === 1 ? '' : 's'} ready or partly fulfilled. {stats.pending} awaiting approval.</p>
            </div>
            <Button variant="outline" className="border-blue-300 bg-white" onClick={() => setStatusFilter(stats.approved > 0 ? 'approved' : 'partially_fulfilled')}>View work queue</Button>
          </CardContent>
        </Card>
      )}

      {/* Pipeline Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Pending Approval', status: 'pending' as RequestStatus, count: stats.pending, color: 'border-l-amber-500 text-amber-700' },
          { label: 'Ready to Dispatch', status: 'approved' as RequestStatus, count: stats.approved, color: 'border-l-blue-500 text-blue-700' },
          { label: 'Partly Fulfilled', status: 'partially_fulfilled' as RequestStatus, count: stats.partial, color: 'border-l-cyan-500 text-cyan-700' },
          { label: 'Awaiting Receipt', status: 'dispatched' as RequestStatus, count: stats.dispatched, color: 'border-l-purple-500 text-purple-700' },
        ].map(s => (
          <Card key={s.label} className={`border-l-4 ${s.color} cursor-pointer`} onClick={() => setStatusFilter(s.status)}>
            <CardContent className="pt-4">
              <p className={`text-3xl font-bold ${s.color.split(' ')[1]}`}>{s.count}</p>
              <p className="text-sm text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by request number, requester, or zone..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="border rounded-md px-3 py-2 text-sm bg-background" value={statusFilter} onChange={e => setStatusFilter(e.target.value as RequestStatus | 'all')}>
          <option value="all">All Status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Requests List */}
      <div className="space-y-3">
        {filtered.map(req => {
          const sc = STATUS_CONFIG[req.status];
          const StatusIcon = sc.icon;
          const isUrgent = req.priority === 'urgent';
          return (
            <Card key={req.id} className={`cursor-pointer hover:shadow-md transition-all ${isUrgent && req.status === 'pending' ? 'border-red-300' : ''}`} onClick={() => openRequest(req)}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{req.requestNumber}</p>
                      {isUrgent && <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium">URGENT</span>}
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${sc.color}`}>
                        <StatusIcon className="w-3 h-3 inline mr-1" />{sc.label}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {req.requestedByName} · {req.farmZone} Zone · {req.items.length} item{req.items.length > 1 ? 's' : ''}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {req.items.slice(0, 3).map(item => (
                        <span key={item.itemId} className="text-xs bg-muted rounded px-2 py-0.5">
                          {item.itemName} x {formatQuantity(item.requestedQty, item.requestedUom ?? item.uom)}
                        </span>
                      ))}
                      {req.items.length > 3 && <span className="text-xs text-muted-foreground">+{req.items.length - 3} more</span>}
                    </div>
                    {req.note && <p className="text-xs text-muted-foreground mt-1 italic">{req.note}</p>}
                  </div>
                  <div className="text-right text-xs text-muted-foreground flex-shrink-0">
                    <p>{new Date(req.requestDate).toLocaleDateString()}</p>
                    <p>{new Date(req.requestDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    {req.requiredByDate && (
                      <p className="text-amber-600 mt-1">Need by: {new Date(req.requiredByDate).toLocaleDateString()}</p>
                    )}
                  </div>
                </div>

                {/* Progress pipeline */}
                <div className="flex items-center gap-1 mt-3">
                  {(['pending', 'approved', 'dispatched', 'received'] as RequestStatus[]).map((s, i) => {
                    const steps = ['pending', 'approved', 'dispatched', 'received'];
                    const curIdx = req.status === 'partially_fulfilled' ? 1 : steps.indexOf(req.status);
                    const done = i <= curIdx && req.status !== 'rejected';
                    return (
                      <div key={s} className="flex items-center gap-1 flex-1">
                        <div className={`h-1.5 w-full rounded-full ${done ? 'bg-green-500' : 'bg-secondary'}`} />
                        {i < 3 && <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${done ? 'bg-green-500' : 'bg-secondary'}`} />}
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>Requested</span><span>Approved</span><span>Dispatched</span><span>Received</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No requests found</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Request Detail Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div>
                  {selectedRequest.requestNumber}
                  {selectedRequest.priority === 'urgent' && <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">URGENT</span>}
                </div>
                <button onClick={() => setSelectedRequest(null)}><X className="w-4 h-4" /></button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {actionError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{actionError}</div>}
              {/* Meta */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Requested By</p><p className="font-medium">{selectedRequest.requestedByName}</p></div>
                <div><p className="text-xs text-muted-foreground">Farm Zone</p><p className="font-medium">{selectedRequest.farmZone}</p></div>
                <div><p className="text-xs text-muted-foreground">Request Date</p><p className="font-medium">{new Date(selectedRequest.requestDate).toLocaleString()}</p></div>
                {selectedRequest.requiredByDate && <div><p className="text-xs text-muted-foreground">Required By</p><p className="font-medium text-amber-600">{new Date(selectedRequest.requiredByDate).toLocaleDateString()}</p></div>}
                {selectedRequest.note && <div className="col-span-2"><p className="text-xs text-muted-foreground">Note</p><p className="italic">{selectedRequest.note}</p></div>}
              </div>

              {/* Items */}
              <div>
                <p className="text-sm font-semibold mb-2">Requested Items</p>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Item</th>
                        <th className="text-left px-3 py-2 font-medium">Qty</th>
                        <th className="text-left px-3 py-2 font-medium">Dispatched</th>
                        <th className="text-left px-3 py-2 font-medium">Received</th>
                        <th className="text-left px-3 py-2 font-medium">Remaining</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRequest.items.map(item => (
                        <tr key={item.itemId} className="border-t">
                          <td className="px-3 py-2">
                            <p>{item.itemName}</p>
                            <p className="text-xs text-muted-foreground capitalize">{item.category}</p>
                          </td>
                          <td className="px-3 py-2 font-mono">
                            {formatQuantity(item.requestedQty, item.requestedUom ?? item.uom)}
                            {(item.requestedUom ?? item.uom) !== item.uom && <p className="text-[10px] text-muted-foreground">= {formatQuantity(item.requestedQtyInStockUom ?? item.requestedQty, item.uom)} stock</p>}
                          </td>
                          <td className="px-3 py-2 font-mono text-blue-600">{item.dispatchedQty !== undefined ? formatQuantity(item.dispatchedQty, item.uom) : '—'}</td>
                          <td className="px-3 py-2 font-mono text-green-600">{item.receivedQty !== undefined ? formatQuantity(item.receivedQty, item.uom) : '—'}</td>
                          <td className="px-3 py-2 font-mono text-amber-700">{formatQuantity(remainingToReceive(item), item.uom)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {canFulfillRequests && ['approved', 'partially_fulfilled'].includes(selectedRequest.status) && selectedRequest.items.some(item => remainingToDispatch(item) > 0) && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <p className="text-sm font-semibold text-blue-950">Record this dispatch</p>
                  <p className="mb-3 text-xs text-blue-800">Enter what is leaving the store now. Short quantities remain open automatically.</p>
                  <div className="space-y-2">
                    {selectedRequest.items.map(item => {
                      const remaining = remainingToDispatch(item);
                      if (remaining <= 0) return null;
                      const available = inventory.find(stock => stock.id === item.itemId)?.currentStock ?? 0;
                      return (
                        <label key={item.itemId} className="grid grid-cols-[1fr_7rem] items-center gap-3 text-sm">
                          <span><span className="font-medium">{item.itemName}</span><span className="block text-xs text-blue-800">Remaining {formatQuantity(remaining, item.uom)} · Available {formatQuantity(available, item.uom)}</span></span>
                          <Input type="number" min={0} max={Math.min(remaining, available)} step="any" value={dispatchQuantities[item.itemId] ?? 0} onChange={event => setDispatchQuantities(current => ({ ...current, [item.itemId]: Number(event.target.value) }))} aria-label={`Dispatch quantity for ${item.itemName}`} />
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div>
                <p className="text-sm font-semibold mb-2">Timeline</p>
                <div className="space-y-2 text-xs">
                  {[
                    { label: 'Requested', time: selectedRequest.requestDate, by: selectedRequest.requestedByName },
                    selectedRequest.approvedAt ? { label: 'Approved', time: selectedRequest.approvedAt, by: selectedRequest.approvedBy || '—' } : null,
                    selectedRequest.dispatchedAt ? { label: 'Dispatched', time: selectedRequest.dispatchedAt, by: selectedRequest.dispatchedBy || '—' } : null,
                    selectedRequest.receivedAt ? { label: 'Received', time: selectedRequest.receivedAt, by: selectedRequest.receivedBy || '—' } : null,
                    selectedRequest.rejectionReason ? { label: 'Rejected', time: selectedRequest.requestDate, by: `Reason: ${selectedRequest.rejectionReason}` } : null,
                  ].filter(Boolean).map((t, i) => t && (
                    <div key={i} className="flex gap-3 items-start">
                      <div className="w-2 h-2 rounded-full bg-green-500 mt-1 flex-shrink-0" />
                      <div>
                        <span className="font-medium">{t.label}</span>
                        <span className="text-muted-foreground ml-2">{new Date(t.time).toLocaleString()}</span>
                        <span className="text-muted-foreground ml-2">· {t.by}</span>
                      </div>
                    </div>
                  ))}
                  {(selectedRequest.fulfillmentHistory ?? []).map((event, index) => (
                    <div key={`${event.recordedAt}-${index}`} className="flex gap-3 items-start">
                      <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
                      <div>
                        <span className="font-medium capitalize">{event.type}</span>
                        <span className="ml-2 text-muted-foreground">{new Date(event.recordedAt).toLocaleString()}</span>
                        <p className="text-muted-foreground">{event.items.map(item => `${formatQuantity(item.quantity, item.uom)}`).join(', ')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                {selectedRequest.status === 'pending' && canApproveRequests && (
                  <>
                    <Button className="bg-green-600 hover:bg-green-700" onClick={() => void handleApprove(selectedRequest.id)} disabled={isWorking}>
                      <CheckCircle2 className="w-4 h-4 mr-1" /> Approve & Schedule Dispatch
                    </Button>
                    <Button variant="destructive" onClick={() => void handleReject(selectedRequest.id, 'Insufficient stock at this time')} disabled={isWorking}>
                      <XCircle className="w-4 h-4 mr-1" /> Reject
                    </Button>
                  </>
                )}
                {['approved', 'partially_fulfilled'].includes(selectedRequest.status) && canFulfillRequests && selectedRequest.items.some(item => remainingToDispatch(item) > 0) && (
                  <Button className="bg-purple-600 hover:bg-purple-700" onClick={() => void handleDispatch(selectedRequest)} disabled={isWorking || !Object.values(dispatchQuantities).some(quantity => quantity > 0)}>
                    <Truck className="w-4 h-4 mr-1" /> Dispatch Selected Quantities
                  </Button>
                )}
                {['partially_fulfilled', 'dispatched'].includes(selectedRequest.status) && (canFulfillRequests || selectedRequest.requestedBy === currentUserId) && selectedRequest.items.some(item => awaitingReceipt(item) > 0) && (
                  <Button className="bg-green-600 hover:bg-green-700" onClick={() => void handleMarkReceived(selectedRequest.id)} disabled={isWorking}>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Confirm Dispatched Quantities Received
                  </Button>
                )}
                <Button variant="outline" onClick={() => setSelectedRequest(null)}>Close</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* New Request Modal */}
      {showNewRequest && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                New Stock Request <button onClick={() => setShowNewRequest(false)}><X className="w-4 h-4" /></button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {actionError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{actionError}</div>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Farm Zone *</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={newReq.farmZone} onChange={e => setNewReq(p => ({ ...p, farmZone: e.target.value as FarmZone }))}>
                    {farmZones.map(z => <option key={z} value={z}>{z}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Priority</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={newReq.priority} onChange={e => setNewReq(p => ({ ...p, priority: e.target.value as StockRequest['priority'] }))}>
                    <option value="normal">Normal</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Required By (optional)</label>
                  <Input type="date" className="mt-1" value={newReq.requiredByDate?.slice(0, 10) || ''} onChange={e => setNewReq(p => ({ ...p, requiredByDate: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium">Note</label>
                  <Input className="mt-1" placeholder="Reason for request..." value={newReq.note || ''} onChange={e => setNewReq(p => ({ ...p, note: e.target.value }))} />
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold mb-2">Add Items</p>
                <div className="flex flex-wrap gap-2">
                  <select className="flex-1 border rounded-md px-3 py-2 text-sm bg-background" value={newReqItem.itemId || ''} onChange={e => setNewReqItem(p => ({ ...p, itemId: e.target.value }))}>
                    <option value="">Select item...</option>
                    {inventory.filter(i => i.isActive).map(i => (
                      <option key={i.id} value={i.id}>{i.name} ({i.currentStock} {i.uom} available)</option>
                    ))}
                  </select>
                  <Input type="number" className="w-24" placeholder="Qty" value={newReqItem.requestedQty || ''} onChange={e => setNewReqItem(p => ({ ...p, requestedQty: parseFloat(e.target.value) || 0 }))} />
                  <select
                    className="w-24 border rounded-md px-2 py-2 text-sm bg-background"
                    value={newReqItem.requestedUom ?? inventory.find(i => i.id === newReqItem.itemId)?.uom ?? 'lt'}
                    onChange={e => setNewReqItem(p => ({ ...p, requestedUom: e.target.value as UOM }))}
                  >
                    {(inventory.find(i => i.id === newReqItem.itemId) ? compatibleUnitsForItem(inventory.find(i => i.id === newReqItem.itemId)!.uom, inventory.find(i => i.id === newReqItem.itemId)!.packSize) : ['lt', 'ml', 'kg', 'g', 'units'] as UOM[]).map(uom => <option key={uom} value={uom}>{uom}</option>)}
                  </select>
                  <Button variant="outline" onClick={addNewReqItem} disabled={!newReqItem.itemId || !newReqItem.requestedQty}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {newReqItem.itemId && Number(newReqItem.requestedQty) > 0 && (() => {
                  const item = inventory.find(i => i.id === newReqItem.itemId);
                  if (!item) return null;
                  const requestedUom = newReqItem.requestedUom ?? item.uom;
                  const stockQty = convertItemQuantity(Number(newReqItem.requestedQty), requestedUom, item.uom, item.packSize);
                  const enough = item.currentStock >= stockQty;
                  return (
                    <div className={`mt-2 rounded-lg border p-2 text-xs ${enough ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                      Request converts to {formatQuantity(stockQty, item.uom)} from stock. {enough ? `${formatQuantity(item.currentStock - stockQty, item.uom)} will remain.` : `Short by ${formatQuantity(stockQty - item.currentStock, item.uom)}.`}
                    </div>
                  );
                })()}
              </div>

              {(newReq.items || []).length > 0 && (
                <div className="border rounded-lg divide-y">
                  {(newReq.items || []).map((item, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span>{item.itemName}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{formatQuantity(item.requestedQty, item.requestedUom ?? item.uom)}</span>
                        <button onClick={() => setNewReq(p => ({ ...p, items: (p.items || []).filter((_, j) => j !== i) }))} className="text-red-500 hover:text-red-700">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowNewRequest(false)}>Cancel</Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => void submitNewRequest()} disabled={!(newReq.items || []).length || isWorking}>
                  {isWorking ? 'Submitting...' : 'Submit Request'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
