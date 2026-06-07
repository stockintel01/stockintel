'use client';

import { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import {
    FileText, Upload, CheckCircle2, AlertCircle,
    Loader2, Search, ArrowRight, User, Pill,
    Stethoscope, BedDouble, Plus, X, Brain, ScanLine
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { authenticatedFetch } from '@/lib/api-client';

interface Drug { name: string; dosage: string; duration: string; instructions: string; }
interface ScanResult {
    patientName: string; age: string; doctorName: string; date: string;
    drugs: Drug[]; notes: string; confidence: 'high' | 'medium' | 'low';
}
interface Prescription {
    id: string; patient: string; date: string; drugs: string;
    status: 'Pending' | 'Completed'; type: 'IP' | 'OP'; ward: string;
}

const CONFIDENCE_CONFIG = {
    high:   { label: 'High confidence',   color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
    medium: { label: 'Medium confidence', color: 'text-amber-600',   bg: 'bg-amber-50 dark:bg-amber-950/30'   },
    low:    { label: 'Low confidence — please verify', color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/30' },
};

export default function PrescriptionsPage() {
    const router = useRouter();
    const { inventory } = useAppStore();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
    const [search, setSearch]         = useState('');
    const [isScanning, setIsScanning] = useState(false);
    const [scanResult, setScanResult] = useState<ScanResult | null>(null);
    const [patientType, setPatientType] = useState<'IP' | 'OP'>('OP');
    const [ward, setWard]             = useState('');
    const [showUpload, setShowUpload] = useState(false);
    const [scanError, setScanError]   = useState('');
    const [dragOver, setDragOver]     = useState(false);

    const filteredRx = prescriptions.filter(rx =>
        rx.patient.toLowerCase().includes(search.toLowerCase()) ||
        rx.id.toLowerCase().includes(search.toLowerCase())
    );

    const processFile = useCallback(async (file: File) => {
        if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
            setScanError('Please upload an image (JPG, PNG) or PDF file.');
            return;
        }

        setShowUpload(false);
        setIsScanning(true);
        setScanError('');
        setScanResult(null);

        const form = new FormData();
        form.append('file', file);

        try {
            const res = await authenticatedFetch('/api/prescriptions', { method: 'POST', body: form });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error ?? 'Digitization failed');
            setScanResult(data);
        } catch (err: unknown) {
            setScanError(err instanceof Error ? err.message : 'Failed to process prescription. Check AI configuration.');
        } finally {
            setIsScanning(false);
        }
    }, []);

    const updateDrug = (idx: number, field: keyof Drug, val: string) => {
        setScanResult(prev => prev ? {
            ...prev,
            drugs: prev.drugs.map((d, i) => i === idx ? { ...d, [field]: val } : d),
        } : null);
    };

    const removeDrug = (idx: number) => {
        setScanResult(prev => prev ? { ...prev, drugs: prev.drugs.filter((_, i) => i !== idx) } : null);
    };

    const addDrug = () => {
        setScanResult(prev => prev ? {
            ...prev,
            drugs: [...prev.drugs, { name: '', dosage: '', duration: '', instructions: '' }],
        } : null);
    };

    const convertToPOS = () => {
        if (!scanResult) return;
        const newRx: Prescription = {
            id:      `RX-${Date.now().toString().slice(-4)}`,
            patient: scanResult.patientName,
            date:    scanResult.date || new Date().toLocaleDateString(),
            drugs:   scanResult.drugs.map(d => d.name).join(', '),
            status:  'Pending',
            type:    patientType,
            ward:    patientType === 'IP' ? ward : '',
        };
        setPrescriptions(prev => [newRx, ...prev]);
        setScanResult(null);
        router.push('/dashboard/sales');
    };

    const markComplete = (id: string) => {
        setPrescriptions(prev => prev.map(rx => rx.id === id ? { ...rx, status: 'Completed' } : rx));
    };

    const cc = scanResult ? CONFIDENCE_CONFIG[scanResult.confidence] : null;

    return (
        <div className="space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Prescriptions</h1>
                    <p className="text-muted-foreground">AI-powered digitization using Claude Vision</p>
                </div>
                <Button onClick={() => setShowUpload(true)}>
                    <Upload className="w-4 h-4 mr-2" /> Digitize Prescription
                </Button>
            </div>

            {/* Scanning overlay */}
            {isScanning && (
                <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
                    <Card className="w-96 text-center p-8 space-y-4 shadow-2xl">
                        <div className="relative w-20 h-20 mx-auto">
                            <Loader2 className="w-20 h-20 text-primary animate-spin" />
                            <Brain className="absolute inset-0 m-auto w-8 h-8 text-primary" />
                        </div>
                        <h2 className="text-xl font-bold">Claude is reading your prescription…</h2>
                        <p className="text-sm text-muted-foreground">Extracting patient name, drugs, dosages and instructions.</p>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '70%' }} />
                        </div>
                    </Card>
                </div>
            )}

            {/* Upload modal */}
            {showUpload && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <Card className="w-full max-w-md">
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Upload Prescription</CardTitle>
                            <button onClick={() => setShowUpload(false)} className="p-1 rounded-lg hover:bg-muted">
                                <X className="w-4 h-4" />
                            </button>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div
                                className={cn(
                                    'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all',
                                    dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground hover:bg-muted/30'
                                )}
                                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={e => {
                                    e.preventDefault(); setDragOver(false);
                                    const f = e.dataTransfer.files[0];
                                    if (f) processFile(f);
                                }}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <ScanLine className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                                <p className="font-medium">Drag & drop or click to upload</p>
                                <p className="text-xs text-muted-foreground mt-1">JPG, PNG, PDF up to 10MB</p>
                                <input
                                    ref={fileInputRef} type="file" className="hidden"
                                    accept="image/*,.pdf"
                                    onChange={e => e.target.files?.[0] && processFile(e.target.files[0])}
                                />
                            </div>
                            {scanError && (
                                <p className="text-sm text-red-600 flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 shrink-0" />{scanError}
                                </p>
                            )}
                            <p className="text-xs text-muted-foreground text-center">
                                Powered by Claude Vision. Works with handwritten and printed prescriptions.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Scan result */}
            {scanResult && (
                <Card className="border-primary/40 shadow-lg">
                    <CardHeader className="bg-primary/5 border-b flex flex-row items-start justify-between gap-4">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                Prescription Digitized
                            </CardTitle>
                            {cc && (
                                <span className={cn('text-xs font-semibold mt-1 inline-block px-2 py-0.5 rounded-full', cc.bg, cc.color)}>
                                    {cc.label}
                                </span>
                            )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                            <Button variant="outline" size="sm" onClick={() => setScanResult(null)}>Discard</Button>
                            <Button size="sm" onClick={convertToPOS}>
                                <ArrowRight className="w-4 h-4 mr-2" /> Send to POS
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="grid lg:grid-cols-2 gap-8">
                            {/* Patient */}
                            <div className="space-y-4">
                                <h3 className="font-semibold flex items-center gap-2 text-sm">
                                    <User className="w-4 h-4 text-primary" /> Patient Information
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground uppercase">Full Name</label>
                                        <Input value={scanResult.patientName} onChange={e => setScanResult(p => p ? { ...p, patientName: e.target.value } : p)} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground uppercase">Age</label>
                                        <Input value={scanResult.age} onChange={e => setScanResult(p => p ? { ...p, age: e.target.value } : p)} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground uppercase">Doctor</label>
                                        <Input value={scanResult.doctorName} onChange={e => setScanResult(p => p ? { ...p, doctorName: e.target.value } : p)} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-muted-foreground uppercase">Date</label>
                                        <Input value={scanResult.date} onChange={e => setScanResult(p => p ? { ...p, date: e.target.value } : p)} />
                                    </div>
                                </div>

                                {/* IP / OP toggle */}
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground uppercase">Patient Type</label>
                                    <div className="flex gap-1 p-1 bg-muted rounded-lg">
                                        {(['OP', 'IP'] as const).map(t => (
                                            <button key={t} onClick={() => setPatientType(t)}
                                                className={cn('flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all',
                                                    patientType === t ? 'bg-background shadow text-foreground' : 'text-muted-foreground'
                                                )}>
                                                {t === 'OP' ? <Stethoscope className="w-4 h-4" /> : <BedDouble className="w-4 h-4" />}
                                                {t === 'OP' ? 'Out-Patient' : 'In-Patient'}
                                            </button>
                                        ))}
                                    </div>
                                    {patientType === 'IP' && (
                                        <Input placeholder="Ward / Bed number e.g. B-102"
                                            value={ward} onChange={e => setWard(e.target.value)} />
                                    )}
                                </div>

                                {scanResult.notes && (
                                    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-400">
                                        <span className="font-semibold">Notes:</span> {scanResult.notes}
                                    </div>
                                )}
                            </div>

                            {/* Drugs */}
                            <div className="space-y-3">
                                <h3 className="font-semibold flex items-center gap-2 text-sm">
                                    <Pill className="w-4 h-4 text-primary" /> Prescribed Drugs ({scanResult.drugs.length})
                                </h3>
                                {scanResult.drugs.map((drug, idx) => {
                                    const matchedInInventory = inventory.some(i =>
                                        i.name.toLowerCase().includes(drug.name.toLowerCase().split(' ')[0])
                                    );
                                    return (
                                        <div key={idx} className={cn(
                                            'group relative bg-muted/30 p-4 rounded-xl border',
                                            matchedInInventory ? 'border-emerald-200 dark:border-emerald-800' : 'border-border'
                                        )}>
                                            {matchedInInventory && (
                                                <span className="absolute top-2 right-8 text-[10px] text-emerald-600 font-semibold">✓ In stock</span>
                                            )}
                                            <button onClick={() => removeDrug(idx)}
                                                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-all">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                            <div className="grid grid-cols-2 gap-2 mb-2">
                                                <div>
                                                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Drug Name</label>
                                                    <Input value={drug.name} className="h-8 text-sm mt-1"
                                                        onChange={e => updateDrug(idx, 'name', e.target.value)} />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Dosage</label>
                                                    <Input value={drug.dosage} className="h-8 text-sm mt-1"
                                                        onChange={e => updateDrug(idx, 'dosage', e.target.value)} />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Duration</label>
                                                    <Input value={drug.duration} className="h-8 text-sm mt-1"
                                                        onChange={e => updateDrug(idx, 'duration', e.target.value)} />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Instructions</label>
                                                    <Input value={drug.instructions} className="h-8 text-sm mt-1"
                                                        onChange={e => updateDrug(idx, 'instructions', e.target.value)} />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                <Button variant="outline" size="sm" className="w-full border-dashed gap-2" onClick={addDrug}>
                                    <Plus className="w-3.5 h-3.5" /> Add Drug
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Prescriptions list */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Recent Prescriptions</CardTitle>
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search patient or RX ID…" className="pl-9" value={search}
                            onChange={e => setSearch(e.target.value)} />
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {filteredRx.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                            <FileText className="w-10 h-10 mb-3 opacity-20" />
                            <p className="font-medium text-sm">No prescriptions found</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50 border-y">
                                    <tr>
                                        {['RX ID', 'Patient', 'Type', 'Drugs', 'Status', 'Actions'].map(h => (
                                            <th key={h} className={cn('px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide',
                                                h === 'Actions' && 'text-right')}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {filteredRx.map(rx => (
                                        <tr key={rx.id} className="hover:bg-muted/40 transition-colors">
                                            <td className="px-4 py-3 font-mono font-bold text-primary text-xs">{rx.id}</td>
                                            <td className="px-4 py-3 font-medium">{rx.patient}</td>
                                            <td className="px-4 py-3">
                                                <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase',
                                                    rx.type === 'IP' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                                                                     : 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                                                )}>
                                                    {rx.type}{rx.ward ? ` · ${rx.ward}` : ''}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">{rx.drugs}</td>
                                            <td className="px-4 py-3">
                                                <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase',
                                                    rx.status === 'Completed'
                                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                                )}>
                                                    {rx.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {rx.status === 'Pending' && (
                                                        <Button size="sm" variant="ghost" className="h-7 text-xs"
                                                            onClick={() => markComplete(rx.id)}>
                                                            <CheckCircle2 className="w-3 h-3 mr-1" /> Complete
                                                        </Button>
                                                    )}
                                                    <Button size="sm" variant="ghost" className="h-7 text-xs"
                                                        onClick={() => router.push('/dashboard/sales')}>
                                                        <ArrowRight className="w-3 h-3 mr-1" /> POS
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
