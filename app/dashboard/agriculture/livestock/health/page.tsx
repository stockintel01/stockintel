'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X, AlertTriangle, Download, Calendar } from 'lucide-react';
import type { VaccinationRecord } from '@/lib/agric/livestock-types';
import { useAppStore } from '@/lib/store';
import { useLivestock } from '@/lib/agric/useLivestock';

const today = new Date().toISOString().slice(0, 10);
const ROUTES = ['drinking_water','injection','spray','eye_drop','oral','topical'];

export default function HealthPage() {
  const { user } = useAppStore();
  const { vaccinations: records, flocks, addRecord } = useLivestock();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    flockHerdId: '', date: today,
    vaccineOrDrug: '', disease: '', routeOfAdmin: 'drinking_water',
    dosage: '', animalCount: 0, nextDueDate: '', withdrawalPeriodDays: 0,
    administeredBy: '', cost: 0, batchNumber: '', notes: ''
  });

  const upcomingVax = records.filter(r => r.nextDueDate && r.nextDueDate >= today && r.nextDueDate <= new Date(Date.now() + 14*86400000).toISOString().slice(0,10));
  const withdrawalActive = records.filter(r => r.withdrawalPeriodDays && r.withdrawalPeriodDays > 0 && new Date(r.date).getTime() + r.withdrawalPeriodDays! * 86400000 > Date.now());

  async function submit() {
    const flock = flocks.find(f => f.id === form.flockHerdId);
    if (!flock || !form.vaccineOrDrug) return;
    const rec: VaccinationRecord = {
      id: `vx_${Date.now()}`, flockHerdId: flock.id, flockHerdName: flock.name,
      species: flock.species as any, date: form.date,
      vaccineOrDrug: form.vaccineOrDrug, batchNumber: form.batchNumber || undefined,
      disease: form.disease || undefined,
      routeOfAdmin: form.routeOfAdmin as any,
      dosage: form.dosage, animalCount: form.animalCount || flock.currentCount,
      nextDueDate: form.nextDueDate || undefined,
      withdrawalPeriodDays: form.withdrawalPeriodDays || undefined,
      administeredBy: form.administeredBy || user?.name || 'Farm Manager',
      cost: form.cost || undefined, notes: form.notes || undefined,
    };
    await addRecord('vaccination', rec);
    setShowForm(false);
    setForm({ flockHerdId: flocks[0]?.id ?? '', date: today, vaccineOrDrug: '', disease: '', routeOfAdmin: 'drinking_water', dosage: '', animalCount: 0, nextDueDate: '', withdrawalPeriodDays: 0, administeredBy: '', cost: 0, batchNumber: '', notes: '' });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">💉 Health & Vaccination</h1><p className="text-muted-foreground text-sm">Vaccination schedules · Treatments · Withdrawal periods</p></div>
        <Button className="bg-blue-700 hover:bg-blue-800" onClick={()=>setShowForm(true)}><Plus className="w-4 h-4 mr-1"/>Log Vaccination</Button>
      </div>
      {upcomingVax.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-1">
          <p className="text-sm font-semibold text-blue-800 flex items-center gap-2"><Calendar className="w-4 h-4"/>Upcoming Vaccinations (next 14 days)</p>
          {upcomingVax.map(r=><p key={r.id} className="text-xs text-blue-700">• {r.vaccineOrDrug} for {r.flockHerdName.split('—')[0].trim()} — due {r.nextDueDate}</p>)}
        </div>
      )}
      {withdrawalActive.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
          <p className="text-sm font-semibold text-amber-800 flex items-center gap-2"><AlertTriangle className="w-4 h-4"/>⚠ Active Withdrawal Periods — Do NOT sell eggs/meat yet</p>
          {withdrawalActive.map(r=>{
            const endsAt = new Date(new Date(r.date).getTime() + (r.withdrawalPeriodDays??0)*86400000);
            const daysLeft = Math.ceil((endsAt.getTime()-Date.now())/86400000);
            return <p key={r.id} className="text-xs text-amber-700">• {r.vaccineOrDrug} ({r.flockHerdName.split('—')[0].trim()}) — withdrawal ends {endsAt.toISOString().slice(0,10)} ({daysLeft} days left)</p>;
          })}
        </div>
      )}
      <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/30 border-b"><tr>{['Date','Flock','Vaccine / Drug','Disease Target','Route','Dosage','Animals','Next Due','Withdrawal','Cost','Admin By'].map(h=><th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>)}</tr></thead><tbody className="divide-y">{records.map((r,i)=>(<tr key={r.id} className={`hover:bg-muted/30 ${i%2===0?'':'bg-muted/10'}`}><td className="px-3 py-2 font-mono text-xs">{r.date}</td><td className="px-3 py-2 text-xs font-medium max-w-[100px] truncate">{r.flockHerdName.split('—')[0].trim()}</td><td className="px-3 py-2 text-xs font-medium">{r.vaccineOrDrug}</td><td className="px-3 py-2 text-xs text-muted-foreground">{r.disease??'—'}</td><td className="px-3 py-2 text-xs capitalize">{(r.routeOfAdmin??'—').replace(/_/g,' ')}</td><td className="px-3 py-2 text-xs">{r.dosage}</td><td className="px-3 py-2 text-xs text-center">{r.animalCount}</td><td className="px-3 py-2 text-xs">{r.nextDueDate??'—'}</td><td className="px-3 py-2 text-xs">{r.withdrawalPeriodDays?<span className="text-amber-700 font-medium">{r.withdrawalPeriodDays}d</span>:'—'}</td><td className="px-3 py-2 text-xs">{r.cost?`GHS ${r.cost}`:'—'}</td><td className="px-3 py-2 text-xs text-muted-foreground">{r.administeredBy}</td></tr>))}</tbody></table></div></CardContent></Card>
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader><CardTitle className="flex items-center justify-between">Log Vaccination / Treatment <button onClick={()=>setShowForm(false)}><X className="w-4 h-4"/></button></CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><label className="text-xs font-medium text-muted-foreground uppercase">Flock / Herd</label><select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={form.flockHerdId} onChange={e=>setForm(f=>({...f,flockHerdId:e.target.value}))}><option value="">Select flock or herd</option>{flocks.filter(f=>f.status==='active').map(fl=><option key={fl.id} value={fl.id}>{fl.name}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium text-muted-foreground uppercase">Date</label><Input type="date" className="mt-1" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
                <div><label className="text-xs font-medium text-muted-foreground uppercase">Animal Count</label><Input type="number" className="mt-1" placeholder="Leave blank for full flock" value={form.animalCount||''} onChange={e=>setForm(f=>({...f,animalCount:parseInt(e.target.value)||0}))}/></div>
              </div>
              <div><label className="text-xs font-medium text-muted-foreground uppercase">Vaccine / Drug Name *</label><Input className="mt-1" placeholder="e.g. Newcastle LaSota" value={form.vaccineOrDrug} onChange={e=>setForm(f=>({...f,vaccineOrDrug:e.target.value}))}/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium text-muted-foreground uppercase">Disease Target</label><Input className="mt-1" placeholder="e.g. Newcastle Disease" value={form.disease} onChange={e=>setForm(f=>({...f,disease:e.target.value}))}/></div>
                <div><label className="text-xs font-medium text-muted-foreground uppercase">Batch Number</label><Input className="mt-1" value={form.batchNumber} onChange={e=>setForm(f=>({...f,batchNumber:e.target.value}))}/></div>
                <div><label className="text-xs font-medium text-muted-foreground uppercase">Route of Admin</label><select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background capitalize" value={form.routeOfAdmin} onChange={e=>setForm(f=>({...f,routeOfAdmin:e.target.value}))}>{ROUTES.map(r=><option key={r} value={r}>{r.replace(/_/g,' ')}</option>)}</select></div>
                <div><label className="text-xs font-medium text-muted-foreground uppercase">Dosage</label><Input className="mt-1" placeholder="e.g. 1ml per bird" value={form.dosage} onChange={e=>setForm(f=>({...f,dosage:e.target.value}))}/></div>
                <div><label className="text-xs font-medium text-muted-foreground uppercase">Next Due Date</label><Input type="date" className="mt-1" value={form.nextDueDate} onChange={e=>setForm(f=>({...f,nextDueDate:e.target.value}))}/></div>
                <div><label className="text-xs font-medium text-muted-foreground uppercase">Withdrawal (days)</label><Input type="number" className="mt-1" placeholder="0 if none" value={form.withdrawalPeriodDays||''} onChange={e=>setForm(f=>({...f,withdrawalPeriodDays:parseInt(e.target.value)||0}))}/></div>
                <div><label className="text-xs font-medium text-muted-foreground uppercase">Administered By</label><Input className="mt-1" value={form.administeredBy||user?.name||''} onChange={e=>setForm(f=>({...f,administeredBy:e.target.value}))}/></div>
                <div><label className="text-xs font-medium text-muted-foreground uppercase">Cost (GHS)</label><Input type="number" className="mt-1" value={form.cost||''} onChange={e=>setForm(f=>({...f,cost:parseFloat(e.target.value)||0}))}/></div>
              </div>
              <div className="flex gap-2 pt-2"><Button variant="outline" className="flex-1" onClick={()=>setShowForm(false)}>Cancel</Button><Button className="flex-1 bg-blue-700 hover:bg-blue-800" onClick={submit} disabled={!form.vaccineOrDrug}>Save</Button></div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
