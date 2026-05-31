'use client';

import { useState, useEffect } from 'react';
import { PatientSearch } from '@/components/pharmacy/PatientSearch';
import { PatientHistory } from '@/components/pharmacy/PatientHistory';
import { Patient } from '@/types/patient';
import { UserRound, Search, ClipboardList, TrendingUp, UserPlus, X, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/lib/store';
import { registerPatient, getDailyStats } from '@/lib/pharmacy-service';

export default function PatientsPage() {
  const { organization } = useAppStore();
  const orgId = organization?.id;

  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [stats, setStats] = useState({ patientsServed: 0, prescriptionsFilled: 0, followUpsPending: 0 });

  // New patient form
  const [form, setForm] = useState({ fullName: '', contactNumber: '', dateOfBirth: '', address: '', allergies: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (orgId) getDailyStats(orgId).then(setStats).catch(console.warn);
  }, [orgId]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fullName || !form.contactNumber) { setError('Name and contact are required'); return; }
    setSaving(true); setError('');
    try {
      await registerPatient({
        fullName: form.fullName,
        contactNumber: form.contactNumber,
        dateOfBirth: form.dateOfBirth,
        address: form.address || undefined,
        allergies: form.allergies ? form.allergies.split(',').map(a => a.trim()).filter(Boolean) : [],
      });
      setShowRegister(false);
      setForm({ fullName: '', contactNumber: '', dateOfBirth: '', address: '', allergies: '' });
    } catch (err: any) {
      setError(err.message || 'Failed to register patient');
    } finally {
      setSaving(false);
    }
  }

  const statCards = [
    { label: 'Patients Today', value: stats.patientsServed, icon: UserRound },
    { label: 'Prescriptions Filled', value: stats.prescriptionsFilled, icon: ClipboardList },
    { label: 'Pending Dispensing', value: stats.followUpsPending, icon: TrendingUp },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Patient Records</h1>
          <p className="text-muted-foreground mt-1">
            Search any patient for their complete global prescription and visit history.
          </p>
        </div>
        <Button onClick={() => setShowRegister(true)}>
          <UserPlus className="w-4 h-4 mr-2" /> Register Patient
        </Button>
      </div>

      {!selectedPatient ? (
        <div className="space-y-8">
          {/* KPIs */}
          <div className="grid gap-4 grid-cols-3">
            {statCards.map((s, i) => (
              <div key={i} className="bg-background border rounded-xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <s.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed rounded-2xl bg-muted/10">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
              <Search className="w-10 h-10 text-primary/40" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Search for a Patient</h2>
            <p className="text-muted-foreground text-sm max-w-sm mb-8">
              Enter a patient's name or phone number to view their complete medical history, prescriptions, and visit records.
            </p>
            <div className="w-full max-w-md">
              <PatientSearch onPatientSelect={setSelectedPatient} />
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Patient data is encrypted and accessible only to your organisation.
            </p>
          </div>
        </div>
      ) : (
        <PatientHistory patient={selectedPatient} onBack={() => setSelectedPatient(null)} orgId={orgId ?? ''} />
      )}

      {/* Register Patient Modal */}
      {showRegister && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Register New Patient
                <button onClick={() => setShowRegister(false)}><X className="w-4 h-4" /></button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleRegister} className="space-y-4">
                {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Full Name *</label>
                    <Input className="mt-1" placeholder="e.g. John Mensah" value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Contact Number *</label>
                    <Input className="mt-1" placeholder="+233 xx xxx xxxx" value={form.contactNumber} onChange={e => setForm(f => ({ ...f, contactNumber: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Date of Birth</label>
                    <Input type="date" className="mt-1" value={form.dateOfBirth} onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Address</label>
                    <Input className="mt-1" placeholder="Home address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm font-medium">Known Allergies</label>
                    <Input className="mt-1" placeholder="e.g. Penicillin, Aspirin (comma-separated)" value={form.allergies} onChange={e => setForm(f => ({ ...f, allergies: e.target.value }))} />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setShowRegister(false)}>Cancel</Button>
                  <Button type="submit" className="flex-1" disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4 mr-1" />}
                    Register Patient
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
