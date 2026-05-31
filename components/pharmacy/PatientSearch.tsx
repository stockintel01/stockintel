'use client';

import { useState, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Loader2, AlertTriangle, UserRound } from 'lucide-react';
import { Patient } from '@/types/patient';
import { searchPatients } from '@/lib/pharmacy-service';

interface PatientSearchProps {
  onPatientSelect: (patient: Patient) => void;
}

export function PatientSearch({ onPatientSelect }: PatientSearchProps) {
  const [term, setTerm]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [results, setResults]   = useState<Patient[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError]       = useState('');
  const debounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (value: string) => {
    if (!value.trim() || value.trim().length < 2) { setResults([]); setSearched(false); return; }
    setLoading(true); setError(''); setSearched(false);
    try {
      const found = await searchPatients(value.trim());
      setResults(found);
      setSearched(true);
    } catch (err: any) {
      setError('Search failed — check Firestore configuration.');
      console.error('[PatientSearch]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setTerm(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(v), 350);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(term);
  };

  return (
    <div className="w-full max-w-md space-y-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Name or phone number…"
            value={term}
            onChange={handleChange}
            autoComplete="off"
          />
        </div>
        <Button type="submit" disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
        </Button>
      </form>

      {error && (
        <p className="text-sm text-red-600 flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5" /> {error}
        </p>
      )}

      {results.length > 0 && (
        <Card>
          <CardContent className="p-2 space-y-1">
            {results.map(patient => (
              <div
                key={patient.id}
                className="flex items-center gap-3 p-2.5 hover:bg-muted rounded-lg cursor-pointer transition-colors border-b last:border-0"
                onClick={() => onPatientSelect(patient)}
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <UserRound className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{patient.fullName}</p>
                  <p className="text-xs text-muted-foreground">{patient.contactNumber}{patient.dateOfBirth ? ` · DOB: ${patient.dateOfBirth}` : ''}</p>
                </div>
                {patient.allergies && patient.allergies.length > 0 && (
                  <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                    ⚠ Allergy
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {searched && results.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-3">
          No patients found. Try a different name or phone number.
        </p>
      )}
    </div>
  );
}
