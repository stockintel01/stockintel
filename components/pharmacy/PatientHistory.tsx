'use client';

import { useState } from 'react';
import { Patient, PatientHistoryRecord } from '@/types/patient';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/lib/store';
import { addPatientRecord } from '@/lib/pharmacy-service';
import {
  ArrowLeft, UserRound, AlertTriangle, Plus,
  Pill, Loader2, Calendar, Building2, X
} from 'lucide-react';

interface Props {
  patient: Patient;
  onBack: () => void;
  orgId: string;
}

export function PatientHistory({ patient, onBack, orgId }: Props) {
  const { organization, user } = useAppStore();
  const [showForm, setShowForm]       = useState(false);
  const [prescription, setPrescription] = useState('');
  const [diagnosis, setDiagnosis]     = useState('');
  const [notes, setNotes]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  // Local copy so we can optimistically update
  const [localHistory, setLocalHistory] = useState<PatientHistoryRecord[]>(patient.history ?? []);

  // Calculate patient age
  const age = patient.dateOfBirth
    ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 86400000))
    : null;

  async function handleAddRecord(e: React.FormEvent) {
    e.preventDefault();
    if (!prescription.trim()) { setError('Prescription is required'); return; }
    setLoading(true); setError('');
    try {
      const record: Omit<PatientHistoryRecord, 'id'> = {
        date: new Date().toISOString(),
        pharmacyId: orgId,
        pharmacyName: organization?.name ?? 'Pharmacy',
        diagnosis: diagnosis || undefined,
        prescription,
        notes: notes || undefined,
      };
      await addPatientRecord(patient.id, record);
      // Optimistic UI
      setLocalHistory(prev => [{ ...record, id: crypto.randomUUID() }, ...prev]);
      setShowForm(false);
      setPrescription(''); setDiagnosis(''); setNotes('');
    } catch (err: any) {
      setError(err.message || 'Failed to save record.');
    } finally {
      setLoading(false);
    }
  }

  const isCurrentOrg = (record: PatientHistoryRecord) => record.pharmacyId === orgId;

  return (
    <div className="space-y-6">
      <Button variant="outline" onClick={onBack}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Search
      </Button>

      <div className="grid md:grid-cols-3 gap-4">
        {/* Patient Info */}
        <Card className="md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <UserRound className="w-4 h-4 text-primary" /> Patient Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Full Name</p>
              <p className="font-semibold text-base">{patient.fullName}</p>
            </div>
            {patient.dateOfBirth && (
              <div>
                <p className="text-xs text-muted-foreground">Date of Birth</p>
                <p className="font-medium">{patient.dateOfBirth}{age !== null ? ` (${age} yrs)` : ''}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">Contact</p>
              <p className="font-medium">{patient.contactNumber}</p>
            </div>
            {patient.address && (
              <div>
                <p className="text-xs text-muted-foreground">Address</p>
                <p className="font-medium">{patient.address}</p>
              </div>
            )}
            {patient.allergies && patient.allergies.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2.5">
                <p className="text-xs font-bold text-red-700 flex items-center gap-1 mb-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Known Allergies
                </p>
                <p className="text-sm font-semibold text-red-700">{patient.allergies.join(', ')}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">Patient Since</p>
              <p className="font-medium">{patient.createdAt ? new Date(patient.createdAt).toLocaleDateString() : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Visits</p>
              <p className="font-semibold text-lg">{localHistory.length}</p>
            </div>
          </CardContent>
        </Card>

        {/* Right: Add record + history */}
        <div className="md:col-span-2 space-y-4">
          {/* Add Visit */}
          {!showForm ? (
            <Button className="w-full" onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-2" /> Add Visit / Prescription
            </Button>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  New Visit Record
                  <button onClick={() => setShowForm(false)}><X className="w-4 h-4" /></button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddRecord} className="space-y-3">
                  {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase">Diagnosis / Presenting Complaint</label>
                    <Input className="mt-1" placeholder="e.g. Upper respiratory tract infection" value={diagnosis} onChange={e => setDiagnosis(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase">Prescription / Treatment *</label>
                    <Input className="mt-1" placeholder="e.g. Amoxicillin 500mg 1-0-1 x 5 days" value={prescription} onChange={e => setPrescription(e.target.value)} required />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase">Clinical Notes</label>
                    <textarea
                      className="flex min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none mt-1"
                      placeholder="Additional notes visible to all pharmacies..."
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={loading}>
                      {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                      Save Record
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* History */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Global Visit History</CardTitle>
              <p className="text-xs text-muted-foreground">Records from all pharmacies — most recent first</p>
            </CardHeader>
            <CardContent>
              {localHistory.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-6">No history records yet.</p>
              ) : (
                <div className="space-y-3">
                  {[...localHistory].sort((a, b) => b.date.localeCompare(a.date)).map(record => (
                    <div
                      key={record.id}
                      className={`border rounded-xl p-4 space-y-2 ${isCurrentOrg(record) ? 'border-primary/30 bg-primary/5' : 'bg-card'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          <div>
                            <p className="font-semibold text-sm">{record.pharmacyName}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(record.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              {' · '}
                              {new Date(record.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                        {isCurrentOrg(record) && (
                          <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Your pharmacy</span>
                        )}
                      </div>
                      {record.diagnosis && (
                        <p className="text-sm"><span className="font-medium">Diagnosis:</span> {record.diagnosis}</p>
                      )}
                      <p className="text-sm flex items-start gap-1.5">
                        <Pill className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                        <span><span className="font-medium">Rx:</span> {record.prescription}</span>
                      </p>
                      {record.notes && (
                        <p className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1.5">{record.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
