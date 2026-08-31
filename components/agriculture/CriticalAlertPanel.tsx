'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AgricAlert } from '@/lib/agric/types';

const ALERT_TYPE_LABELS: Record<AgricAlert['type'], string> = {
  low_stock: 'Low stock',
  restock_needed: 'Restocking',
  equipment_overdue: 'Equipment overdue',
  plan_shortfall: 'Plan shortfall',
  adjustment_pending: 'Stock adjustment',
  deletion_log: 'Data change',
  restock_request: 'Restock request',
};

function alertActionUrl(alert: AgricAlert): string {
  if (alert.actionUrl) return alert.actionUrl;
  if (alert.type === 'equipment_overdue') return '/dashboard/agriculture/equipment';
  if (alert.type === 'plan_shortfall') return '/dashboard/agriculture/planner';
  return '/dashboard/agriculture/stock-management';
}

export function CriticalAlertPanel({ alerts, onMarkReviewed }: { alerts: AgricAlert[]; onMarkReviewed: (alertId: string) => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const groups = Object.entries(alerts.reduce<Partial<Record<AgricAlert['type'], number>>>((result, alert) => {
    result[alert.type] = (result[alert.type] ?? 0) + 1;
    return result;
  }, {})).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));

  if (alerts.length === 0) return null;

  return <section className="overflow-hidden rounded-xl border border-red-200 bg-red-50" aria-labelledby="critical-alert-summary">
    <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="rounded-lg bg-red-100 p-2"><AlertCircle className="h-5 w-5 text-red-700" /></div>
        <div className="min-w-0 flex-1">
          <p id="critical-alert-summary" className="font-semibold text-red-950">{alerts.length} critical alert{alerts.length === 1 ? '' : 's'} need attention</p>
          <p className="mt-0.5 text-sm text-red-800">Grouped by operational cause to keep this overview focused.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {groups.map(([type, count]) => <span key={type} className="rounded-full border border-red-200 bg-white/70 px-2.5 py-1 text-xs font-medium text-red-800">{ALERT_TYPE_LABELS[type as AgricAlert['type']]}: {count}</span>)}
          </div>
        </div>
      </div>
      <Button size="sm" variant="outline" className="border-red-300 bg-white text-red-800 hover:bg-red-100" aria-expanded={open} aria-controls="critical-alert-queue" onClick={() => setOpen(current => !current)}>
        {open ? 'Hide details' : 'Review alerts'}<ChevronDown className={`ml-2 h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>
    </div>
    {open && <div id="critical-alert-queue" className="border-t border-red-200 bg-white/60 p-3">
      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {alerts.map(alert => <div key={alert.id} className="flex flex-col gap-3 rounded-lg border border-red-100 bg-white p-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-foreground">{alert.title}</p><span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800">{ALERT_TYPE_LABELS[alert.type]}</span></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{alert.message}</p></div>
          <div className="flex shrink-0 gap-2"><Link href={alertActionUrl(alert)}><Button size="sm" variant="outline">Open</Button></Link><Button size="sm" variant="ghost" onClick={() => void onMarkReviewed(alert.id)}>Mark reviewed</Button></div>
        </div>)}
      </div>
    </div>}
  </section>;
}
