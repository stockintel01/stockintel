'use client';

import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/lib/store';
import {
    FileText, Upload, CheckCircle2, AlertCircle,
    Loader2, Search, ArrowRight, User, Pill,
    Stethoscope, BedDouble
} from 'lucide-react';
import { useRouter } from 'next/navigation';

// Mock data for prescriptions
const MOCK_PRESCRIPTIONS = [
    { id: 'RX-7721', patient: 'John Doe', date: '2026-05-21', drugs: 'Amoxicillin, Paracetamol', status: 'Pending', type: 'OP', ward: '' },
    { id: 'RX-7722', patient: 'Jane Smith', date: '2026-05-20', drugs: 'Metformin, Atorvastatin', status: 'Completed', type: 'IP', ward: 'B-102' },
    { id: 'RX-7723', patient: 'Robert Brown', date: '2026-05-19', drugs: 'Ibuprofen', status: 'Pending', type: 'OP', ward: '' },
];

interface Drug {
    name: string;
    dosage: string;
    duration: string;
}

interface ScanResult {
    patientName: string;
    age: string;
    drugs: Drug[];
}

export default function PrescriptionsPage() {
    const { currency } = useAppStore();
    const router = useRouter();
    const [prescriptions, setPrescriptions] = useState(MOCK_PRESCRIPTIONS);
    const [isScanning, setIsScanning] = useState(false);
    const [scanResult, setScanResult] = useState<ScanResult | null>(null);
    const [patientType, setPatientType] = useState<'IP' | 'OP'>('OP');
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleUpload = () => {
        setIsScanning(true);
        setIsUploadOpen(false);

        // Simulate AI analysis
        setTimeout(() => {
            setIsScanning(false);
            setScanResult({
                patientName: 'Alice Johnson',
                age: '34',
                drugs: [
                    { name: 'Augmentin 625mg', dosage: '1-0-1', duration: '5 Days' },
                    { name: 'Panadol Extend', dosage: '1-1-1', duration: '3 Days' }
                ]
            });
        }, 3000);
    };

    const convertToPOS = () => {
        // In a real app, we'd save this to a state/store
        // and pre-fill the cart. For now, we'll just navigate
        router.push('/dashboard/sales');
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Prescription Handling</h1>
                    <p className="text-muted-foreground">AI-powered digitization & IP/OP management</p>
                </div>
                <Button onClick={() => setIsUploadOpen(true)}>
                    <Upload className="w-4 h-4 mr-2" /> Digitize Prescription
                </Button>
            </div>

            {/* AI Scanning Animation Overlay */}
            {isScanning && (
                <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
                    <Card className="w-[400px] text-center p-8 space-y-4 shadow-2xl">
                        <div className="relative w-20 h-20 mx-auto">
                            <Loader2 className="w-20 h-20 text-primary animate-spin" />
                            <FileText className="absolute inset-0 m-auto w-8 h-8 text-primary" />
                        </div>
                        <h2 className="text-xl font-bold italic">AI Analysis in Progress...</h2>
                        <p className="text-sm text-muted-foreground">
                            Extracting patient details and drug information using Pharmasmart Vision AI.
                        </p>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden mt-4">
                            <div className="h-full bg-primary animate-progress-fast" />
                        </div>
                    </Card>
                </div>
            )}

            {/* Upload Mock Dialog */}
            {isUploadOpen && (
                <div className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <Card className="w-full max-w-md">
                        <CardHeader>
                            <CardTitle>Upload Prescription</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div
                                className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-10 text-center hover:bg-muted/30 transition-colors cursor-pointer"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
                                <p className="font-medium">Drag & drop image here</p>
                                <p className="text-xs text-muted-foreground mt-1">Supports JPG, PNG, PDF up to 10MB</p>
                                <input type="file" ref={fileInputRef} className="hidden" onChange={handleUpload} />
                            </div>
                            <div className="flex justify-end gap-3">
                                <Button variant="ghost" onClick={() => setIsUploadOpen(false)}>Cancel</Button>
                                <Button onClick={handleUpload}>Start Scan</Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Scan Results View */}
            {scanResult && (
                <Card className="border-primary/50 shadow-lg animate-in zoom-in-95">
                    <CardHeader className="bg-primary/5 border-b flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <CheckCircle2 className="w-5 h-5 text-green-600" />
                                AI Content Verification
                            </CardTitle>
                            <p className="text-xs text-muted-foreground mt-1">Review and confirm extracted details before billing.</p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setScanResult(null)}>Discard</Button>
                            <Button size="sm" onClick={convertToPOS}>
                                <ArrowRight className="w-4 h-4 mr-2" /> Convert to POS
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="grid md:grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <div className="space-y-4">
                                    <h3 className="font-semibold flex items-center gap-2">
                                        <User className="w-4 h-4 text-primary" /> Patient Information
                                    </h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium uppercase text-muted-foreground">Full Name</label>
                                            <Input defaultValue={scanResult.patientName} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-medium uppercase text-muted-foreground">Age</label>
                                            <Input defaultValue={scanResult.age} />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium uppercase text-muted-foreground">Patient Type</label>
                                        <div className="flex gap-2 p-1 bg-muted rounded-lg">
                                            <button
                                                onClick={() => setPatientType('OP')}
                                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${patientType === 'OP' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
                                            >
                                                <Stethoscope className="w-4 h-4" /> Out-Patient (OP)
                                            </button>
                                            <button
                                                onClick={() => setPatientType('IP')}
                                                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${patientType === 'IP' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
                                            >
                                                <BedDouble className="w-4 h-4" /> In-Patient (IP)
                                            </button>
                                        </div>
                                    </div>

                                    {patientType === 'IP' && (
                                        <div className="space-y-2 animate-in slide-in-from-top-2">
                                            <label className="text-xs font-medium uppercase text-muted-foreground">Ward / Room Linking</label>
                                            <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                                                <option>General Ward - Bed 12</option>
                                                <option>ICU - Bed 04</option>
                                                <option>Maternity - Room 201</option>
                                                <option>Orthopedic - Bed 45</option>
                                            </select>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-6">
                                <h3 className="font-semibold flex items-center gap-2">
                                    <Pill className="w-4 h-4 text-primary" /> Prescribed Drugs
                                </h3>
                                <div className="space-y-3">
                                    {scanResult.drugs.map((drug, idx) => (
                                        <div key={idx} className="flex gap-3 items-end bg-muted/30 p-4 rounded-xl relative group">
                                            <div className="flex-1 space-y-2">
                                                <label className="text-[10px] font-bold uppercase text-muted-foreground">Drug Name</label>
                                                <Input defaultValue={drug.name} />
                                            </div>
                                            <div className="w-24 space-y-2">
                                                <label className="text-[10px] font-bold uppercase text-muted-foreground">Dosage</label>
                                                <Input defaultValue={drug.dosage} />
                                            </div>
                                            <div className="w-24 space-y-2">
                                                <label className="text-[10px] font-bold uppercase text-muted-foreground">Duration</label>
                                                <Input defaultValue={drug.duration} />
                                            </div>
                                            <Button variant="ghost" size="icon" className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 h-6 w-6">
                                                <AlertCircle className="w-3 h-3 text-red-500" />
                                            </Button>
                                        </div>
                                    ))}
                                    <Button variant="outline" className="w-full border-dashed" size="sm">
                                        + Add Another Drug
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Prescriptions List */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Recent Prescriptions</CardTitle>
                    <div className="relative w-64">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search patient or ID..." className="pl-10" />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="relative overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                                <tr>
                                    <th className="px-4 py-3">RX ID</th>
                                    <th className="px-4 py-3">Patient</th>
                                    <th className="px-4 py-3">Type</th>
                                    <th className="px-4 py-3">Drugs</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {prescriptions.map((rx) => (
                                    <tr key={rx.id} className="hover:bg-muted/50 transition-colors">
                                        <td className="px-4 py-3 font-mono font-bold text-primary">{rx.id}</td>
                                        <td className="px-4 py-3 font-medium">{rx.patient}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold ${rx.type === 'IP' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                                {rx.type} {rx.ward ? `(${rx.ward})` : ''}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 truncate max-w-[200px] text-muted-foreground">{rx.drugs}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold ${rx.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {rx.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <Button variant="ghost" size="sm">View Detail</Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
