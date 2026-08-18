'use client';

import Link from 'next/link';
import { ArrowRight, BarChart3, Check, ShieldCheck, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';

const outcomes = [
  'Accurate farm input, usage, and request records',
  'Packhouse, dispatch, crop, poultry, and livestock workflows',
  'Permissions that match each person’s responsibility',
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-6 sm:px-8">
        <nav className="flex items-center justify-between border-b border-slate-200 pb-5">
          <Link href="/" className="flex items-center gap-3" aria-label="StockIntel Agri home">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-700 text-sm font-bold text-white">SI</div>
            <div><p className="font-semibold tracking-tight">StockIntel Agri</p><p className="text-xs text-slate-500">Farm operations platform</p></div>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/login"><Button variant="ghost" className="text-slate-700">Sign in</Button></Link>
            <Link href="/login?mode=signup"><Button className="bg-emerald-700 hover:bg-emerald-800">Start free trial</Button></Link>
          </div>
        </nav>

        <div className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:py-24">
          <div className="max-w-2xl">
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">Built for modern agriculture</p>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">Clear operations. Confident decisions.</h1>
            <p className="mt-6 text-lg leading-8 text-slate-600">One dependable workspace for agricultural inventory, field activity, packhouse operations, teams, expenses, and reporting.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login?mode=signup"><Button size="lg" className="bg-emerald-700 hover:bg-emerald-800">Create workspace <ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
              <Link href="/demo"><Button size="lg" variant="outline" className="border-slate-300"><BarChart3 className="mr-2 h-4 w-4" /> Explore report demo</Button></Link>
            </div>
            <ul className="mt-10 space-y-3 text-sm text-slate-600">
              {outcomes.map(outcome => <li key={outcome} className="flex items-start gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />{outcome}</li>)}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-200 pb-5"><div className="rounded-lg bg-emerald-100 p-2 text-emerald-800"><Sprout className="h-5 w-5" /></div><div><p className="font-semibold">Farm operations, in one place</p><p className="text-sm text-slate-500">Designed for practical daily work</p></div></div>
            <div className="space-y-4 pt-5 text-sm">
              <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="font-medium">Inventory and field usage</p><p className="mt-1 text-slate-500">Know what is available, requested, issued, and consumed.</p></div>
              <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="font-medium">Packhouse and shipping</p><p className="mt-1 text-slate-500">Track packing output, station stock, and dispatches.</p></div>
              <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><p>Role-based access keeps each team member focused on the work assigned to them.</p></div>
            </div>
          </div>
        </div>

        <footer className="border-t border-slate-200 py-5 text-xs text-slate-500">StockIntel Agri · Secure, tenant-aware farm operations software</footer>
      </section>
    </main>
  );
}
