'use client';

import { useState } from 'react';
import {
  Plus, Search, CheckCircle2, Clock, XCircle, Truck,
  Package, ChevronDown, X, AlertTriangle, ArrowRight, Bell
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MOCK_AGRIC_INVENTORY, FARM_ZONES } from '@/lib/agric/mock-data';
import { useAppStore } from '@/lib/store';
import { useAgric } from '@/lib/agric/useAgric';
import { StockRequest, StockRequestItem, RequestStatus, FarmZone, AgricCategory } from '@/lib/agric/types';

const STATUS_CONFIG: Record<RequestStatus, { label: string; color: string; icon: any }> = {
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock },
  approved: { label: 'Approved', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: CheckCircle2 },
  dispatched: { label: 'Dispatched', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: Truck },
  received: { label: 'Received', color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
};

// Role perspective — in production this comes from auth context
const CURRENT_ROLE: 'farm_manager' | 'stockkeeper' = 'stockkeeper';

export default function RequestsPage() {
  const { requests, approveRequest, rejectRequest, dispatchReq, confirmReceived, createRequest } = useAgric();
  const { user } = useAppStore();
  const currentUserName = user?.name ?? 'Farm Manager';
  const currentUserId = user?.id ?? 'user';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RequestStatus | 'all'>('all');
  const [selectedRequest, setSelectedRequest] = useState<StockRequest | null>(null);
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [dispatchModal, setDispatchModal] = useState<StockRequest | null>(null);

  // New request state
  const [newReq, setNewReq] = useState<Partial<StockRequest>>({
    farmZone: 'Banana', priority: 'normal', items: []
  });
  const [newReqItem, setNewReqItem] = useState<Partial<StockRequestItem>>({});

  const filtered = requests.filter(r => {
    const matchSearch = r.requestNumber.toLowerCase().includes(search.toLowerCase()) ||
      r.requestedByName.toLowerCase().includes(search.toLowerCase()) ||
      r.farmZone.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = {
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    dispatched: requests.filter(r => r.status === 'dispatched').length,
    received: requests.filter(r => r.status === 'received').length,
  };

  async function handleApprove(reqId: string) { await approveRequest(reqId); setSelectedRequest(null); }

  async function handleReject(reqId: string, reason: string) { await rejectRequest(reqId, reason); setSelectedRequest(null); }

  async function handleDispatch(req: StockRequest) {
    await dispatchReq(req.id, req.items.map(i => ({ itemId: i.itemId, qty: i.requestedQty })));
    setDispatchModal(null); setSelectedRequest(null);
  }

  async function handleMarkReceived(reqId: string) { await confirmReceived(reqId); setSelectedRequest(null); }

  function addNewReqItem() {
    if (!newReqItem.itemId || !newReqItem.requestedQty) return;
    const invItem = MOCK_AGRIC_INVENTORY.find(i => i.id === newReqItem.itemId);
    if (!invItem) return;
    const item: StockRequestItem = {
      itemId: invItem.id, itemName: invItem.name, category: invItem.category as AgricCategory,
      requestedQty: newReqItem.requestedQty!, uom: invItem.uom as any, note: newReqItem.note
    };
    setNewReq(prev => ({ ...prev, items: [...(prev.items || []), item] }));
    setNewReqItem({});
  }

  async function submitNewRequest() {
    if (!newReq.farmZone || !newReq.items?.length) return;
    await createRequest({
      requestNumber: '', requestedBy: currentUserId, requestedByName: currentUserName,
      requestedByRole: 'farm_manager', requestDate: new Date().toISOString(),
      farmZone: newReq.farmZone as FarmZone, priority: (newReq.priority as any) || 'normal',
      items: newReq.items!, status: 'pending', note: newReq.note,
      requiredByDate: newReq.requiredByDate,
    });
    setNewReq({ farmZone: 'Banana', priority: 'normal', items: [] });
    setShowNewRequest(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Stock Requests</h1>
          <p className="text-muted-foreground text-sm">Farm managers request items · Storekeepers dispatch and track fulfillment</p>
        </div>
        <Button className="bg-green-600 hover:bg-green-700" onClick={() => setShowNewRequest(true)}>
          <Plus className="w-4 h-4 mr-1" /> New Request
        </Button>
      </div>

      {/* Pipeline Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Pending', count: stats.pending, color: 'border-l-amber-500 text-amber-700', bg: 'bg-amber-50' },
          { label: 'Approved', count: stats.approved, color: 'border-l-blue-500 text-blue-700', bg: 'bg-blue-50' },
          { label: 'Dispatched', count: stats.dispatched, color: 'border-l-purple-500 text-purple-700', bg: 'bg-purple-50' },
          { label: 'Received', count: stats.received, color: 'border-l-green-500 text-green-700', bg: 'bg-green-50' },
        ].map(s => (
          <Card key={s.label} className={`border-l-4 ${s.color} cursor-pointer`} onClick={() => setStatusFilter(s.label.toLowerCase() as RequestStatus)}>
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
        <select className="border rounded-md px-3 py-2 text-sm bg-background" value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
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
            <Card key={req.id} className={`cursor-pointer hover:shadow-md transition-all ${isUrgent && req.status === 'pending' ? 'border-red-300' : ''}`} onClick={() => setSelectedRequest(req)}>
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
                          {item.itemName} × {item.requestedQty} {item.uom}
                        </span>
                      ))}
                      {req.items.length > 3 && <span className="text-xs text-muted-foreground">+{req.items.length - 3} more</span>}
                    </div>
                    {req.note && <p className="text-xs text-muted-foreground mt-1 italic">"{req.note}"</p>}
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
                    const curIdx = steps.indexOf(req.status);
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
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Item</th>
                        <th className="text-left px-3 py-2 font-medium">Qty</th>
                        <th className="text-left px-3 py-2 font-medium">Dispatched</th>
                        <th className="text-left px-3 py-2 font-medium">Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRequest.items.map(item => (
                        <tr key={item.itemId} className="border-t">
                          <td className="px-3 py-2">
                            <p>{item.itemName}</p>
                            <p className="text-xs text-muted-foreground capitalize">{item.category}</p>
                          </td>
                          <td className="px-3 py-2 font-mono">{item.requestedQty} {item.uom}</td>
                          <td className="px-3 py-2 font-mono text-blue-600">{item.dispatchedQty !== undefined ? `${item.dispatchedQty} ${item.uom}` : '—'}</td>
                          <td className="px-3 py-2 font-mono text-green-600">{item.receivedQty !== undefined ? `${item.receivedQty} ${item.uom}` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

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
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                {selectedRequest.status === 'pending' && (
                  <>
                    <Button className="bg-green-600 hover:bg-green-700" onClick={() => handleApprove(selectedRequest.id)}>
                      <CheckCircle2 className="w-4 h-4 mr-1" /> Approve & Schedule Dispatch
                    </Button>
                    <Button variant="destructive" onClick={() => handleReject(selectedRequest.id, 'Insufficient stock at this time')}>
                      <XCircle className="w-4 h-4 mr-1" /> Reject
                    </Button>
                  </>
                )}
                {selectedRequest.status === 'approved' && (
                  <Button className="bg-purple-600 hover:bg-purple-700" onClick={() => { setDispatchModal(selectedRequest); setSelectedRequest(null); }}>
                    <Truck className="w-4 h-4 mr-1" /> Mark as Dispatched
                  </Button>
                )}
                {selectedRequest.status === 'dispatched' && (
                  <Button className="bg-green-600 hover:bg-green-700" onClick={() => handleMarkReceived(selectedRequest.id)}>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Confirm Receipt
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Farm Zone *</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={newReq.farmZone} onChange={e => setNewReq(p => ({ ...p, farmZone: e.target.value as FarmZone }))}>
                    {FARM_ZONES.map(z => <option key={z} value={z}>{z}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Priority</label>
                  <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={newReq.priority} onChange={e => setNewReq(p => ({ ...p, priority: e.target.value as any }))}>
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
                <div className="flex gap-2">
                  <select className="flex-1 border rounded-md px-3 py-2 text-sm bg-background" value={newReqItem.itemId || ''} onChange={e => setNewReqItem(p => ({ ...p, itemId: e.target.value }))}>
                    <option value="">Select item...</option>
                    {MOCK_AGRIC_INVENTORY.filter(i => i.isActive).map(i => (
                      <option key={i.id} value={i.id}>{i.name} ({i.currentStock} {i.uom} available)</option>
                    ))}
                  </select>
                  <Input type="number" className="w-24" placeholder="Qty" value={newReqItem.requestedQty || ''} onChange={e => setNewReqItem(p => ({ ...p, requestedQty: parseFloat(e.target.value) || 0 }))} />
                  <Button variant="outline" onClick={addNewReqItem} disabled={!newReqItem.itemId || !newReqItem.requestedQty}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {(newReq.items || []).length > 0 && (
                <div className="border rounded-lg divide-y">
                  {(newReq.items || []).map((item, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span>{item.itemName}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{item.requestedQty} {item.uom}</span>
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
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={submitNewRequest} disabled={!(newReq.items || []).length}>
                  Submit Request
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
