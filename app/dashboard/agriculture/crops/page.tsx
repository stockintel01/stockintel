'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sprout, Plus, X } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { addCropPlan, subscribeCropPlans, type CropPlanRecord } from '@/lib/agric/crop-service';

type CropPlan = CropPlanRecord;

const EMPTY_FORM = {
  cropName: '', fieldName: '', season: '', startDate: '', expectedHarvestDate: '',
  status: 'planned' as CropPlan['status'], progress: 0, notes: '',
};

export default function CropCalendarPage() {
  const { organization, user } = useAppStore();
  const [plans, setPlans] = useState<CropPlan[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!organization?.id) return;
    return subscribeCropPlans(organization.id, setPlans, error => console.error('[crop plans]', error));
  }, [organization?.id]);

  async function addPlan() {
    if (!organization?.id || !user?.id || !form.cropName || !form.fieldName || !form.startDate) return;
    await addCropPlan(organization.id, user.id, form);
    setForm(EMPTY_FORM);
    setShowForm(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold tracking-tight">Crop Calendar & Advisory</h1><p className="text-muted-foreground">Live crop cycles and seasonal planning.</p></div>
        <Button onClick={() => setShowForm(true)}><Plus className="w-4 h-4 mr-2" />Add Crop Plan</Button>
      </div>

      {plans.length === 0 && !showForm && (
        <Card><CardContent className="py-16 text-center"><Sprout className="w-10 h-10 mx-auto text-green-600 mb-3" /><p className="font-semibold">No crop plans yet</p><p className="text-sm text-muted-foreground">Create the first plan for this organization.</p></CardContent></Card>
      )}

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="flex items-center justify-between">New Crop Plan <button onClick={() => setShowForm(false)}><X className="w-4 h-4" /></button></CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-3">
            <Input placeholder="Crop name" value={form.cropName} onChange={event => setForm(value => ({ ...value, cropName: event.target.value }))} />
            <Input placeholder="Field or block" value={form.fieldName} onChange={event => setForm(value => ({ ...value, fieldName: event.target.value }))} />
            <Input placeholder="Season" value={form.season} onChange={event => setForm(value => ({ ...value, season: event.target.value }))} />
            <Input type="date" value={form.startDate} onChange={event => setForm(value => ({ ...value, startDate: event.target.value }))} />
            <Input type="date" value={form.expectedHarvestDate} onChange={event => setForm(value => ({ ...value, expectedHarvestDate: event.target.value }))} />
            <select className="border rounded-md px-3 text-sm bg-background" value={form.status} onChange={event => setForm(value => ({ ...value, status: event.target.value as CropPlan['status'] }))}>
              {['planned', 'planted', 'growing', 'harvesting', 'completed'].map(status => <option key={status} value={status}>{status}</option>)}
            </select>
            <Input type="number" min={0} max={100} placeholder="Progress %" value={form.progress} onChange={event => setForm(value => ({ ...value, progress: Number(event.target.value) }))} />
            <Input className="md:col-span-2" placeholder="Notes" value={form.notes} onChange={event => setForm(value => ({ ...value, notes: event.target.value }))} />
            <Button onClick={addPlan}>Save Crop Plan</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {plans.map(plan => (
          <Card key={plan.id}>
            <CardHeader><CardTitle className="flex justify-between"><span>{plan.cropName}</span><span className="text-sm font-normal capitalize text-muted-foreground">{plan.status}</span></CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{plan.fieldName}{plan.season ? ` · ${plan.season}` : ''}</p>
              <div className="h-2 bg-secondary rounded-full overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${Math.min(100, plan.progress)}%` }} /></div>
              <div className="flex justify-between text-xs text-muted-foreground"><span>Start: {plan.startDate}</span><span>Harvest: {plan.expectedHarvestDate || 'Not set'}</span></div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
