'use client';

import { useState, useEffect } from 'react';
import { useAppStore, StockLocation } from '@/lib/store';
import {
    subscribeToLocations, subscribeToTransfers,
    createTransfer, completeTransfer, cancelTransfer,
    markInTransit, addLocation, StockTransfer,
} from '@/lib/location-service';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
    MapPin, Plus, ArrowRight, Package, CheckCircle2,
    Clock, Truck, XCircle, AlertTriangle, Loader2,
    Building2, RotateCcw, X
} from 'lucide-react';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
    pending:    { label: 'Pending',     icon: Clock,        color: 'text-amber-600',  bg: 'bg-amber-50 dark:bg-amber-950/30',  border: 'border-amber-200 dark:border-amber-800' },
    in_transit: { label: 'In Transit',  icon: Truck,        color: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-950/30',    border: 'border-blue-200 dark:border-blue-800'   },
    completed:  { label: 'Completed',   icon: CheckCircle2, color: 'text-emerald-600',bg: 'bg-emerald-50 dark:bg-emerald-950/30',border:'border-emerald-200 dark:border-emerald-800'},
    cancelled:  { label: 'Cancelled',   icon: XCircle,      color: 'text-red-500',    bg: 'bg-red-50 dark:bg-red-950/30',      border: 'border-red-200 dark:border-red-800'     },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function LocationsPage() {
    const { organization, user, inventory, currency } = useAppStore();

    const [locations, setLocations]   = useState<StockLocation[]>([]);
    const [transfers, setTransfers]   = useState<StockTransfer[]>([]);
    const [tab, setTab]               = useState<'overview' | 'transfer' | 'history'>('overview');
    const [busy, setBusy]             = useState<string | null>(null); // transferId being acted on

    // Add location form
    const [showAddLocation, setShowAddLocation] = useState(false);
    const [newLocName, setNewLocName]           = useState('');
    const [newLocAddress, setNewLocAddress]     = useState('');
    const [addingLoc, setAddingLoc]             = useState(false);

    // New transfer form
    const [fromLoc, setFromLoc]           = useState('');
    const [toLoc, setToLoc]               = useState('');
    const [selectedItems, setSelectedItems] = useState<{ itemId: string; quantity: number }[]>([]);
    const [transferNotes, setTransferNotes] = useState('');
    const [creatingTransfer, setCreatingTransfer] = useState(false);
    const [transferError, setTransferError] = useState('');

    const orgId = organization?.id ?? '';

    // ── Subscriptions ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!orgId) return;
        const u1 = subscribeToLocations(orgId, setLocations);
        const u2 = subscribeToTransfers(orgId, setTransfers);
        return () => { u1(); u2(); };
    }, [orgId]);

    // ── Handlers ─────────────────────────────────────────────────────────────

    const handleAddLocation = async () => {
        if (!orgId || !newLocName.trim()) return;
        setAddingLoc(true);
        try {
            await addLocation(orgId, {
                name: newLocName.trim(),
                address: newLocAddress.trim(),
                isDefault: locations.length === 0,
            });
            setNewLocName(''); setNewLocAddress(''); setShowAddLocation(false);
        } finally { setAddingLoc(false); }
    };

    const toggleItem = (itemId: string) => {
        setSelectedItems(prev => {
            const ex = prev.find(i => i.itemId === itemId);
            if (ex) return prev.filter(i => i.itemId !== itemId);
            return [...prev, { itemId, quantity: 1 }];
        });
    };

    const setItemQty = (itemId: string, qty: number) => {
        setSelectedItems(prev => prev.map(i => i.itemId === itemId ? { ...i, quantity: qty } : i));
    };

    const handleCreateTransfer = async () => {
        if (!fromLoc || !toLoc || selectedItems.length === 0 || fromLoc === toLoc) return;
        setCreatingTransfer(true);
        setTransferError('');
        try {
            const fromName = locations.find(l => l.id === fromLoc)?.name ?? fromLoc;
            const toName   = locations.find(l => l.id === toLoc)?.name ?? toLoc;

            await createTransfer(orgId, {
                organizationId: orgId,
                fromLocationId: fromLoc, fromLocationName: fromName,
                toLocationId:   toLoc,   toLocationName:   toName,
                items: selectedItems.map(si => {
                    const inv = inventory.find(i => i.id === si.itemId)!;
                    return { itemId: si.itemId, itemName: inv.name, sku: inv.sku, quantity: si.quantity };
                }),
                notes: transferNotes,
                createdBy: user?.name ?? 'Unknown',
            });

            setFromLoc(''); setToLoc(''); setSelectedItems([]); setTransferNotes('');
            setTab('history');
        } catch (err: unknown) {
            setTransferError(err instanceof Error ? err.message : 'Failed to create transfer.');
        } finally { setCreatingTransfer(false); }
    };

    const handleAction = async (
        transferId: string,
        action: 'transit' | 'complete' | 'cancel',
    ) => {
        setBusy(transferId);
        try {
            if (action === 'transit')  await markInTransit(orgId, transferId);
            if (action === 'complete') await completeTransfer(orgId, transferId);
            if (action === 'cancel')   await cancelTransfer(orgId, transferId);
        } catch (err: unknown) {
            console.error(err instanceof Error ? err.message : 'Action failed.');
        } finally { setBusy(null); }
    };

    // ── Stats ─────────────────────────────────────────────────────────────────
    const activeTransfers = transfers.filter(t => t.status === 'pending' || t.status === 'in_transit');
    const completedCount  = transfers.filter(t => t.status === 'completed').length;

    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Locations & Transfers</h1>
                    <p className="text-muted-foreground mt-1">
                        Manage stock across {locations.length} location{locations.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <Button onClick={() => setShowAddLocation(true)} size="sm">
                    <Plus className="w-4 h-4 mr-2" /> Add Location
                </Button>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Locations',         value: locations.length,                icon: Building2,    color: 'text-primary'       },
                    { label: 'Active Transfers',  value: activeTransfers.length,          icon: Truck,        color: 'text-blue-600'      },
                    { label: 'Completed',         value: completedCount,                  icon: CheckCircle2, color: 'text-emerald-600'   },
                    { label: 'Total Inventory',   value: inventory.length,                icon: Package,      color: 'text-violet-600'    },
                ].map(s => (
                    <Card key={s.label} className="p-4">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-muted-foreground font-medium">{s.label}</span>
                            <s.icon className={cn('w-4 h-4', s.color)} />
                        </div>
                        <p className="text-2xl font-bold">{s.value}</p>
                    </Card>
                ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b">
                {(['overview', 'transfer', 'history'] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)}
                        className={cn('px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors -mb-px',
                            tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                        )}>
                        {t === 'transfer' ? 'New Transfer' : t}
                    </button>
                ))}
            </div>

            {/* ── Overview tab ─────────────────────────────────────────────── */}
            {tab === 'overview' && (
                <div className="space-y-4">
                    {locations.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed rounded-2xl text-center bg-muted/10">
                            <MapPin className="w-14 h-14 text-muted-foreground/25 mb-4" />
                            <h3 className="text-lg font-semibold mb-2">No locations yet</h3>
                            <p className="text-muted-foreground text-sm max-w-xs mb-6">
                                Add your first location — a warehouse, store, or branch — to start managing multi-location stock.
                            </p>
                            <Button onClick={() => setShowAddLocation(true)}>
                                <Plus className="w-4 h-4 mr-2" /> Add Your First Location
                            </Button>
                        </div>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {locations.map(loc => {
                                const locTransfers = transfers.filter(
                                    t => (t.fromLocationId === loc.id || t.toLocationId === loc.id) && t.status !== 'cancelled'
                                );
                                return (
                                    <Card key={loc.id} className={cn('relative', loc.isDefault && 'ring-2 ring-primary')}>
                                        {loc.isDefault && (
                                            <span className="absolute top-3 right-3 text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                                Default
                                            </span>
                                        )}
                                        <CardHeader className="pb-2">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                                    <Building2 className="w-5 h-5 text-primary" />
                                                </div>
                                                <div>
                                                    <CardTitle className="text-base">{loc.name}</CardTitle>
                                                    {loc.address && <p className="text-xs text-muted-foreground mt-0.5">{loc.address}</p>}
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="pt-0">
                                            <div className="flex items-center gap-4 text-sm">
                                                <div>
                                                    <p className="font-semibold">{inventory.length}</p>
                                                    <p className="text-xs text-muted-foreground">Items</p>
                                                </div>
                                                <div>
                                                    <p className="font-semibold">{locTransfers.length}</p>
                                                    <p className="text-xs text-muted-foreground">Transfers</p>
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-emerald-600">
                                                        {currency}{inventory.reduce((s, i) => s + i.mrp * i.quantity, 0).toLocaleString()}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">Stock value</p>
                                                </div>
                                            </div>
                                            <Button variant="outline" size="sm" className="w-full mt-3 gap-2"
                                                onClick={() => { setFromLoc(loc.id); setTab('transfer'); }}>
                                                <ArrowRight className="w-3.5 h-3.5" /> Transfer from here
                                            </Button>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    )}

                    {/* Active transfers summary */}
                    {activeTransfers.length > 0 && (
                        <div>
                            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
                                Active transfers
                            </h3>
                            <div className="space-y-2">
                                {activeTransfers.map(t => {
                                    const sc = STATUS_CONFIG[t.status];
                                    return (
                                        <div key={t.id} className={cn('flex items-center gap-3 p-3 rounded-lg border', sc.bg, sc.border)}>
                                            <sc.icon className={cn('w-4 h-4 shrink-0', sc.color)} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium">
                                                    {t.fromLocationName} <ArrowRight className="w-3 h-3 inline mx-1" /> {t.toLocationName}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {t.items.length} item{t.items.length > 1 ? 's' : ''} · {t.createdBy}
                                                </p>
                                            </div>
                                            <span className={cn('text-xs font-semibold', sc.color)}>{sc.label}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── New Transfer tab ─────────────────────────────────────────── */}
            {tab === 'transfer' && (
                <div className="max-w-2xl space-y-6">
                    {locations.length < 2 ? (
                        <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-2xl text-center bg-muted/10">
                            <Building2 className="w-12 h-12 text-muted-foreground/25 mb-3" />
                            <h3 className="font-semibold mb-2">Need at least 2 locations</h3>
                            <p className="text-muted-foreground text-sm mb-4">Add another location before creating a transfer.</p>
                            <Button onClick={() => { setShowAddLocation(true); setTab('overview'); }} size="sm">
                                <Plus className="w-4 h-4 mr-2" /> Add Location
                            </Button>
                        </div>
                    ) : (
                        <>
                            {/* From / To */}
                            <Card>
                                <CardHeader><CardTitle>Transfer Route</CardTitle></CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label className="mb-1.5 block">From location *</Label>
                                            <select className="w-full h-10 border-1.5 border rounded-md px-3 text-sm bg-background"
                                                value={fromLoc} onChange={e => setFromLoc(e.target.value)}>
                                                <option value="">Select source…</option>
                                                {locations.map(l => <option key={l.id} value={l.id} disabled={l.id === toLoc}>{l.name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <Label className="mb-1.5 block">To location *</Label>
                                            <select className="w-full h-10 border-1.5 border rounded-md px-3 text-sm bg-background"
                                                value={toLoc} onChange={e => setToLoc(e.target.value)}>
                                                <option value="">Select destination…</option>
                                                {locations.map(l => <option key={l.id} value={l.id} disabled={l.id === fromLoc}>{l.name}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    {fromLoc && toLoc && fromLoc === toLoc && (
                                        <p className="text-xs text-red-600">Source and destination cannot be the same location.</p>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Item selector */}
                            <Card>
                                <CardHeader><CardTitle>Select Items to Transfer</CardTitle></CardHeader>
                                <CardContent>
                                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                        {inventory.filter(i => i.quantity > 0).map(item => {
                                            const sel = selectedItems.find(s => s.itemId === item.id);
                                            return (
                                                <div key={item.id} className={cn(
                                                    'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                                                    sel ? 'bg-primary/5 border-primary/40' : 'hover:bg-muted/50'
                                                )} onClick={() => toggleItem(item.id)}>
                                                    <div className={cn('w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                                                        sel ? 'bg-primary border-primary' : 'border-muted-foreground/40')}>
                                                        {sel && <div className="w-2 h-2 rounded-sm bg-white" />}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium truncate">{item.name}</p>
                                                        <p className="text-xs text-muted-foreground">{item.sku} · {item.quantity} in stock</p>
                                                    </div>
                                                    {sel && (
                                                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                                            <button onClick={() => setItemQty(item.id, Math.max(1, sel.quantity - 1))}
                                                                className="w-6 h-6 rounded border flex items-center justify-center text-xs hover:bg-muted">−</button>
                                                            <span className="w-8 text-center text-sm font-medium">{sel.quantity}</span>
                                                            <button onClick={() => setItemQty(item.id, Math.min(item.quantity, sel.quantity + 1))}
                                                                className="w-6 h-6 rounded border flex items-center justify-center text-xs hover:bg-muted">+</button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {selectedItems.length > 0 && (
                                        <p className="text-xs text-muted-foreground mt-3">
                                            {selectedItems.length} item{selectedItems.length > 1 ? 's' : ''} selected ·{' '}
                                            {selectedItems.reduce((s, i) => s + i.quantity, 0)} total units
                                        </p>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Notes */}
                            <div className="space-y-1.5">
                                <Label>Notes (optional)</Label>
                                <Input placeholder="e.g. Replenish branch A for weekend peak…"
                                    value={transferNotes} onChange={e => setTransferNotes(e.target.value)} />
                            </div>

                            {transferError && (
                                <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/30 text-red-700 border border-red-200 rounded-lg p-3 text-sm">
                                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{transferError}
                                </div>
                            )}

                            <Button className="w-full h-11" disabled={!fromLoc || !toLoc || fromLoc === toLoc || selectedItems.length === 0 || creatingTransfer}
                                onClick={handleCreateTransfer}>
                                {creatingTransfer ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating transfer…</> : (
                                    <><ArrowRight className="w-4 h-4 mr-2" />Create Transfer Request</>
                                )}
                            </Button>
                        </>
                    )}
                </div>
            )}

            {/* ── History tab ──────────────────────────────────────────────── */}
            {tab === 'history' && (
                <div className="space-y-3">
                    {transfers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-2xl text-center bg-muted/10">
                            <RotateCcw className="w-12 h-12 text-muted-foreground/25 mb-3" />
                            <h3 className="font-semibold mb-2">No transfers yet</h3>
                            <p className="text-muted-foreground text-sm mb-4">Create your first stock transfer to see it here.</p>
                            <Button variant="outline" onClick={() => setTab('transfer')} size="sm">New Transfer</Button>
                        </div>
                    ) : transfers.map(t => {
                        const sc = STATUS_CONFIG[t.status];
                        const isBusy = busy === t.id;
                        return (
                            <Card key={t.id} className={cn('border', sc.border)}>
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex items-start gap-3">
                                            <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', sc.bg)}>
                                                <sc.icon className={cn('w-4 h-4', sc.color)} />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-sm">
                                                    {t.fromLocationName} <ArrowRight className="w-3 h-3 inline mx-1" /> {t.toLocationName}
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    By {t.createdBy} · {t.items.length} item{t.items.length > 1 ? 's' : ''} ·{' '}
                                                    {t.items.reduce((s, i) => s + i.quantity, 0)} units
                                                </p>
                                                {t.notes && <p className="text-xs text-muted-foreground italic mt-1">"{t.notes}"</p>}
                                                <div className="flex flex-wrap gap-1 mt-2">
                                                    {t.items.map(item => (
                                                        <span key={item.itemId} className="text-[10px] bg-muted px-2 py-0.5 rounded-full font-medium">
                                                            {item.itemName} ×{item.quantity}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-2 shrink-0">
                                            <span className={cn('text-xs font-bold px-2 py-1 rounded-full', sc.bg, sc.color)}>{sc.label}</span>
                                            <div className="flex gap-1.5">
                                                {t.status === 'pending' && (
                                                    <>
                                                        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={isBusy}
                                                            onClick={() => handleAction(t.id!, 'transit')}>
                                                            {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Truck className="w-3 h-3 mr-1" />Dispatch</>}
                                                        </Button>
                                                        <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                                                            disabled={isBusy} onClick={() => handleAction(t.id!, 'cancel')}>
                                                            <X className="w-3 h-3" />
                                                        </Button>
                                                    </>
                                                )}
                                                {t.status === 'in_transit' && (
                                                    <Button size="sm" className="h-7 text-xs" disabled={isBusy}
                                                        onClick={() => handleAction(t.id!, 'complete')}>
                                                        {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <><CheckCircle2 className="w-3 h-3 mr-1" />Confirm Received</>}
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* ── Add location modal ───────────────────────────────────────── */}
            {showAddLocation && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-background rounded-2xl shadow-2xl w-full max-w-sm p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="font-bold text-lg">Add Location</h3>
                            <button onClick={() => setShowAddLocation(false)} className="p-1 rounded-lg hover:bg-muted">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <Label className="mb-1.5 block">Location Name *</Label>
                                <Input placeholder="e.g. Main Warehouse, Branch A, Shelf 3"
                                    value={newLocName} onChange={e => setNewLocName(e.target.value)} />
                            </div>
                            <div>
                                <Label className="mb-1.5 block">Address <span className="text-muted-foreground font-normal">(optional)</span></Label>
                                <Input placeholder="123 Street, City"
                                    value={newLocAddress} onChange={e => setNewLocAddress(e.target.value)} />
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <Button variant="outline" className="flex-1" onClick={() => setShowAddLocation(false)}>Cancel</Button>
                            <Button className="flex-1" disabled={!newLocName.trim() || addingLoc} onClick={handleAddLocation}>
                                {addingLoc ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Location'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
