'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X, AlertTriangle, Download } from 'lucide-react';
import { MOCK_MORTALITY, MOCK_FLOCKS } from '@/lib/agric/livestock-mock-data';
import type { MortalityRecord } from '@/lib/agric/livestock-types';
import { useAppStore } from '@/lib/store';

const today = new Date().toISOString().slice(0, 10);
const REASONS = ['disease','predator','injury','heat_stress','cold_stress','nutritional_deficiency','unknown','culled','sold'];
const DISPOSAL = ['buried','incinerated','composted','biogas','other'];

export default function MortalityPage() {
  const { user } = useAppStore();
  const [records, setRecords] = useState<MortalityRecord[]>(MOCK_MORTALITY);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    flockId: MOCK_FLOCKS[0]?.id ?? '', date: today, count: 1,
    reason: 'unknown', symptoms: '', disposalMethod: 'buried',
    vetVisitRequired: false, notes: ''
  });

  const totalToday = records.filter(r => r.date === today).reduce((s,r) => s + r.count, 0);
  const vetPending = records.filter(r => r.vetVisitRequired && !r.vetVisitDate).length;
  const totalThisWeek = records.reduce((s,r) => s + r.count, 0);

  function submit() {
    const flock = MOCK_FLOCKS.find(f => f.id === form.flockId);
    if (!flock) return;
    const rec: MortalityRecord = {
      id: `mr_${Date.now()}`,
      flockId: flock.id, flockName: flock.name,
      species: flock.species as any,
      date: form.date, count: form.count,
      reason: form.reason as any,
      symptoms: form.symptoms || undefined,
      disposalMethod: form.disposalMethod as any,
      vetVisitRequired: form.vetVisitRequired,
      recordedBy: user?.name ?? 'Farm Manager',
      notes: form.notes || undefined,
    };
    setRecords(prev => [rec, ...prev]);
    setShowForm(false);
    setForm({ flockId: MOCK_FLOCKS[0]?.id ?? '', date: today, count: 1, reason: 'unknown', symptoms: '', disposalMethod: 'buried', vetVisitRequired: false, notes: '' });
  }

  function exportCSV() {
    const rows = [
      ['Date','Flock','Species','Count','Reason','Symptoms','Disposal','Vet Required','Recorded By'],
      ...records.map(r => [r.date, r.flockName, r.species, r.count, r.reason, r.symptoms??''  , r.disposalMethod??''  , r.vetVisitRequired?'Yes':'No', r.recordedBy]),
    ];
    const a = document.createElement('a');
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(rows.map(r=>r.join(',')).join('\n'))}`;
    a.download = `mortality-log-${today}.csv`; a.click();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">📉 Mortality Log</h1><p className="text-muted-foreground text-sm">Track deaths, causes, and veterinary follow-ups</p></div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-4 h-4 mr-1"/>Export</Button>
          <Button className="bg-red-600 hover:bg-red-700" onClick={() => setShowForm(true)}><Plus className="w-4 h-4 mr-1"/>Record Death</Button>
        </div>
      </div>
      {vetPending > 0 && <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-3 text-sm"><AlertTriangle className="w-4 h-4 text-red-600"/><p className="text-red-800"><strong>{vetPending} case{vetPending>1?'s':''}</strong> require a vet visit — schedule immediately.</p></div>}
      <div className="grid grid-cols-3 gap-3">
        {[{label:'Deaths Today',value:totalToday,color:'border-l-red-500'},{label:'Vet Visits Pending',value:vetPending,color:'border-l-amber-500'},{label:'Deaths This Period',value:totalThisWeek,color:'border-l-slate-400'}].map(k=>(
          <Card key={k.label} className={`border-l-4 ${k.color}`}><CardContent className="pt-3 pb-3"><p className="text-2xl font-bold">{k.value}</p><p className="text-xs text-muted-foreground">{k.label}</p></CardContent></Card>
        ))}
      </div>
      <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/30 border-b"><tr>{['Date','Flock','Species','Count','Reason','Symptoms','Disposal','Vet Required','Recorded By'].map(h=><th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>)}</tr></thead><tbody className="divide-y">{records.map((r,i)=>(
        <tr key={r.id} className={`hover:bg-muted/30 ${r.vetVisitRequired && !r.vetVisitDate ? 'bg-red-50' : i%2===0?'':'bg-muted/10'}`}>
          <td className="px-3 py-2 font-mono text-xs">{r.date}</td>
          <td className="px-3 py-2 text-xs font-medium max-w-[120px] truncate">{r.flockName.split('—')[0].trim()}</td>
          <td className="px-3 py-2 text-xs capitalize">{r.species.replace(/_/g,' ')}</td>
          <td className="px-3 py-2 font-bold text-red-600">{r.count}</td>
          <td className="px-3 py-2 text-xs capitalize">{r.reason.replace(/_/g,' ')}</td>
          <td className="px-3 py-2 text-xs max-w-[160px] truncate text-muted-foreground">{r.symptoms ?? '—'}</td>
          <td className="px-3 py-2 text-xs capitalize">{r.disposalMethod ?? '—'}</td>
          <td className="px-3 py-2 text-xs">{r.vetVisitRequired ? <span className="text-red-600 font-semibold">Yes ⚠</span> : 'No'}</td>
          <td className="px-3 py-2 text-xs text-muted-foreground">{r.recordedBy}</td>
        </tr>))}</tbody></table></div></CardContent></Card>
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
            <CardHeader><CardTitle className="flex items-center justify-between">Record Mortality <button onClick={() => setShowForm(false)}><X className="w-4 h-4"/></button></CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><label className="text-xs font-medium text-muted-foreground uppercase">Flock / Herd *</label><select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={form.flockId} onChange={e=>setForm(f=>({...f,flockId:e.target.value}))}>{MOCK_FLOCKS.filter(f=>f.status==='active').map(fl=><option key={fl.id} value={fl.id}>{fl.name}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium text-muted-foreground uppercase">Date</label><Input type="date" className="mt-1" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
                <div><label className="text-xs font-medium text-muted-foreground uppercase">Count *</label><Input type="number" min={1} className="mt-1" value={form.count} onChange={e=>setForm(f=>({...f,count:parseInt(e.target.value)||1}))}/></div>
              </div>
              <div><label className="text-xs font-medium text-muted-foreground uppercase">Cause of Death</label><select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background capitalize" value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))}>{REASONS.map(r=><option key={r} value={r} className="capitalize">{r.replace(/_/g,' ')}</option>)}</select></div>
              <div><label className="text-xs font-medium text-muted-foreground uppercase">Symptoms Observed</label><textarea className="w-full border rounded-md px-3 py-2 text-sm mt-1 resize-none" rows={2} value={form.symptoms} onChange={e=>setForm(f=>({...f,symptoms:e.target.value}))} placeholder="Describe observed signs..."/></div>
              <div><label className="text-xs font-medium text-muted-foreground uppercase">Disposal Method</label><select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background capitalize" value={form.disposalMethod} onChange={e=>setForm(f=>({...f,disposalMethod:e.target.value}))}>{DISPOSAL.map(d=><option key={d} value={d}>{d}</option>)}</select></div>
              <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={form.vetVisitRequired} onChange={e=>setForm(f=>({...f,vetVisitRequired:e.target.checked}))}/> Veterinary visit required</label>
              <Input placeholder="Additional notes..." value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={()=>setShowForm(false)}>Cancel</Button>
                <Button className="flex-1 bg-red-600 hover:bg-red-700" onClick={submit}>Save Record</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
