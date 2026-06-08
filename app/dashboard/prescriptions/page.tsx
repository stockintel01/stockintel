'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/lib/store';
import {
  FileText, Upload, CheckCircle2, AlertCircle,
  Loader2, Search, ArrowRight, User, Pill,
  Stethoscope, BedDouble, Plus, X, RefreshCw,
  Clock, CheckCheck, XCircle, Download
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  subscribePrescriptions, createPrescription, dispensePrescription,
  cancelPrescription, getDailyStats, type Prescription,
} from '@/lib/pharmacy-service';
import { authenticatedFetch } from '@/lib/api-client';

interface Drug { name: string; dosage: string; duration: string; qty?: number; }
interface ScanResult { patientName: string; age: string; drugs: Drug[]; }

const STATUS_CONFIG = {
  pending:   { label: 'Pending',   color: 'bg-amber-100 text-amber-700',   icon: Clock      },
  dispensed: { label: 'Dispensed', color: 'bg-green-100 text-green-700',   icon: CheckCheck },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700',       icon: XCircle    },
};

export default function PrescriptionsPage() {
  const { organization, user } = useAppStore();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const orgId = organization?.id;

  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading]             = useState(true);
  const [isScanning, setIsScanning]       = useState(false);
  const [scanResult, setScanResult]       = useState<ScanResult | null>(null);
  const [patientType, setPatientType]     = useState<'IP' | 'OP'>('OP');
  const [ward, setWard]                   = useState('');
  const [isUploadOpen, setIsUploadOpen]   = useState(false);
  const [search, setSearch]               = useState('');
  const [statusFilter, setStatusFilter]   = useState<'all' | Prescription['status']>('all');
  const [stats, setStats]                 = useState({ prescriptionsFilled: 0, patientsServed: 0, followUpsPending: 0 });
  const [patientName, setPatientName]     = useState('');
  const [patientAge, setPatientAge]       = useState('');
  const [drugs, setDrugs]                 = useState<Drug[]>([{ name: '', dosage: '', duration: '' }]);
  const [showManual, setShowManual]       = useState(false);
  const [scanError, setScanError]         = useState('');

  // Load live prescriptions
  useEffect(() => {
    if (!orgId) { setLoading(false); return; }
    const unsub = subscribePrescriptions(orgId, rxs => { setPrescriptions(rxs); setLoading(false); }, () => setLoading(false));
    getDailyStats(orgId).then(setStats).catch(console.warn);
    return () => unsub();
  }, [orgId]);

  const filtered = prescriptions.filter(rx => {
    const matchSearch = !search ||
      rx.rxNumber.toLowerCase().includes(search.toLowerCase()) ||
      rx.patientName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || rx.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // AI scan simulation (replace with real vision API call in production)
  const handleScanFile = useCallback((file: File) => {
    setIsScanning(true);
    setIsUploadOpen(false);
    setScanError('');
    const formData = new FormData();
    formData.append('file', file);
    authenticatedFetch('/api/prescriptions', { method: 'POST', body: formData })
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? 'Prescription scan failed');
        setScanResult(data);
        setPatientName(data.patientName ?? '');
        setPatientAge(data.age ?? '');
        setDrugs(data.drugs ?? [{ name: '', dosage: '', duration: '' }]);
      })
      .catch(err => setScanError(err instanceof Error ? err.message : 'Prescription scan failed'))
      .finally(() => setIsScanning(false));
  }, []);

  async function submitPrescription() {
    if (!orgId || !user || drugs.filter(d => d.name).length === 0) return;
    await createPrescription(orgId, {
      patientName: patientName || 'Walk-in Patient',
      patientAge,
      patientType,
      ward: patientType === 'IP' ? ward : undefined,
      drugs: drugs.filter(d => d.name),
      status: 'pending',
      source: scanResult ? 'ai_scan' : 'manual',
      createdBy: user.id,
    });
    setScanResult(null); setShowManual(false);
    setPatientName(''); setPatientAge(''); setWard('');
    setDrugs([{ name: '', dosage: '', duration: '' }]);
  }

  async function handleDispense(rx: Prescription) {
    if (!orgId || !user) return;
    await dispensePrescription(orgId, rx.id, user.name, []);
  }

  async function handleCancel(rxId: string) {
    if (!orgId) return;
    await cancelPrescription(orgId, rxId);
  }

  function exportCSV() {
    const rows = [
      ['RX Number', 'Patient', 'Type', 'Drugs', 'Status', 'Date'],
      ...filtered.map(rx => [
        rx.rxNumber, rx.patientName, rx.patientType,
        rx.drugs.map(d => d.name).join('; '),
        rx.status, rx.createdAt.slice(0, 10),
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    a.download = `prescriptions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  const PrescriptionForm = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase">Patient Name</label>
          <Input className="mt-1" placeholder="Full name" value={patientName} onChange={e => setPatientName(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase">Age</label>
          <Input className="mt-1" placeholder="e.g. 34" value={patientAge} onChange={e => setPatientAge(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase">Patient Type</label>
        <div className="flex gap-2 p-1 bg-muted rounded-lg mt-1">
          {(['OP', 'IP'] as const).map(t => (
            <button key={t} onClick={() => setPatientType(t)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${patientType === t ? 'bg-background shadow' : 'text-muted-foreground'}`}>
              {t === 'OP' ? <Stethoscope className="w-4 h-4" /> : <BedDouble className="w-4 h-4" />}
              {t === 'OP' ? 'Out-Patient' : 'In-Patient'}
            </button>
          ))}
        </div>
      </div>
      {patientType === 'IP' && (
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase">Ward / Room</label>
          <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={ward} onChange={e => setWard(e.target.value)}>
            <option value="">Select ward...</option>
            <option>General Ward - Bed 12</option>
            <option>ICU - Bed 04</option>
            <option>Maternity - Room 201</option>
            <option>Orthopedic - Bed 45</option>
          </select>
        </div>
      )}
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase">Prescribed Drugs</label>
        <div className="space-y-2 mt-1">
          {drugs.map((drug, idx) => (
            <div key={idx} className="flex gap-2 items-start bg-muted/30 p-3 rounded-lg">
              <div className="flex-1">
                <Input placeholder="Drug name" value={drug.name} onChange={e => { const d = [...drugs]; d[idx].name = e.target.value; setDrugs(d); }} />
              </div>
              <div className="w-24">
                <Input placeholder="Dosage" value={drug.dosage} onChange={e => { const d = [...drugs]; d[idx].dosage = e.target.value; setDrugs(d); }} />
              </div>
              <div className="w-24">
                <Input placeholder="Duration" value={drug.duration} onChange={e => { const d = [...drugs]; d[idx].duration = e.target.value; setDrugs(d); }} />
              </div>
              {drugs.length > 1 && (
                <button onClick={() => setDrugs(drugs.filter((_, i) => i !== idx))} className="p-2 text-red-400 hover:text-red-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" className="w-full border-dashed" onClick={() => setDrugs([...drugs, { name: '', dosage: '', duration: '' }])}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Drug
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Prescription Handling</h1>
          <p className="text-muted-foreground">AI-powered digitisation · IP/OP management · Real-time dispensing</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}><Download className="w-4 h-4 mr-1" /> Export</Button>
          <Button variant="outline" onClick={() => setShowManual(true)}><FileText className="w-4 h-4 mr-1" /> Manual Entry</Button>
          <Button onClick={() => setIsUploadOpen(true)}><Upload className="w-4 h-4 mr-2" /> Scan Prescription</Button>
        </div>
      </div>

      {scanError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{scanError}</div>}

      {/* Daily KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Patients Today', value: stats.patientsServed, color: 'text-blue-600' },
          { label: 'Prescriptions Filled', value: stats.prescriptionsFilled, color: 'text-green-600' },
          { label: 'Pending Dispensing', value: stats.followUpsPending, color: 'text-amber-600' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4">
              <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-sm text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* AI Scanning Overlay */}
      {isScanning && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <Card className="w-[400px] text-center p-8 space-y-4 shadow-2xl">
            <div className="relative w-20 h-20 mx-auto">
              <Loader2 className="w-20 h-20 text-primary animate-spin" />
              <FileText className="absolute inset-0 m-auto w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold">Scanning Prescription…</h2>
            <p className="text-sm text-muted-foreground">Extracting patient details and drug information using AI Vision.</p>
          </Card>
        </div>
      )}

      {/* Upload Dialog */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">Upload Prescription <button onClick={() => setIsUploadOpen(false)}><X className="w-4 h-4" /></button></CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-10 text-center hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleScanFile(f); }}
              >
                <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
                <p className="font-medium">Drag & drop or click to upload</p>
                <p className="text-xs text-muted-foreground mt-1">JPG, PNG, PDF up to 10MB</p>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*,.pdf"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleScanFile(f); }} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setIsUploadOpen(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Scan Result / Manual Entry Form */}
      {(scanResult || showManual) && (
        <Card className="border-primary/40 shadow-lg">
          <CardHeader className="bg-primary/5 border-b flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                {scanResult ? 'Review Scanned Prescription' : 'New Prescription'}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Review details before saving.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setScanResult(null); setShowManual(false); }}>Discard</Button>
              <Button size="sm" onClick={submitPrescription} disabled={drugs.filter(d => d.name).length === 0}>
                <CheckCheck className="w-4 h-4 mr-1" /> Save Prescription
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <PrescriptionForm />
          </CardContent>
        </Card>
      )}

      {/* Prescriptions Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Prescriptions</CardTitle>
          <div className="flex items-center gap-3">
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search patient or RX ID…" className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="border rounded-md px-3 py-2 text-sm bg-background" value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="dispensed">Dispensed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading prescriptions…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left">RX ID</th>
                    <th className="px-4 py-3 text-left">Patient</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Drugs</th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map(rx => {
                    const sc = STATUS_CONFIG[rx.status];
                    const StatusIcon = sc.icon;
                    return (
                      <tr key={rx.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-primary">{rx.rxNumber}</td>
                        <td className="px-4 py-3 font-medium">{rx.patientName}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold ${rx.patientType === 'IP' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                            {rx.patientType}{rx.ward ? ` (${rx.ward})` : ''}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground truncate max-w-[180px]">
                          {rx.drugs.map(d => d.name).join(', ')}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {new Date(rx.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase font-bold ${sc.color}`}>
                            <StatusIcon className="w-3 h-3" />{sc.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            {rx.status === 'pending' && (
                              <>
                                <Button variant="outline" size="sm" className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50"
                                  onClick={() => handleDispense(rx)}>
                                  Dispense
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500"
                                  onClick={() => handleCancel(rx.id)}>
                                  Cancel
                                </Button>
                              </>
                            )}
                            {rx.status !== 'pending' && (
                              <Button variant="ghost" size="sm" className="h-7 text-xs">View</Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && !loading && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                        <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        {search ? 'No prescriptions match your search' : 'No prescriptions yet — scan or enter one above'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
