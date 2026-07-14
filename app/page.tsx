'use client';

import Link from 'next/link';
import { ArrowRight, CloudSun, Leaf, PackageCheck, ShieldCheck, Tractor, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

const highlights = [
  { title: 'Farm Stock Control', text: 'Live input stock, requests, dispatch, adjustments and low-stock alerts.', icon: PackageCheck },
  { title: 'Packhouse & Shipping', text: 'Packing stations, reefer stock, dispatch logs and station assignments.', icon: Tractor },
  { title: 'Weather Intelligence', text: 'Location-aware weather and field advisories for day-to-day decisions.', icon: CloudSun },
  { title: 'Offline Ready', text: 'Firestore persistence and PWA caching keep supported workflows available offline.', icon: WifiOff },
  { title: 'Role-Based Teams', text: 'Owners assign workers to the exact agriculture tools and stations they need.', icon: ShieldCheck },
  { title: 'Crop, Poultry & Livestock', text: 'Configurable workspaces for crop production, poultry, livestock or mixed farms.', icon: Leaf },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-950 via-green-900 to-slate-950 text-white">
      <section className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-400 font-black text-emerald-950">SI</div>
            <div>
              <p className="font-bold leading-none">StockIntel Agri</p>
              <p className="text-xs text-emerald-200">Premium farm operations OS</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/login"><Button variant="secondary">Sign in</Button></Link>
            <Link href="/login?mode=signup"><Button className="bg-emerald-400 text-emerald-950 hover:bg-emerald-300">Start now</Button></Link>
          </div>
        </nav>

        <div className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="mb-5 inline-flex rounded-full border border-emerald-300/30 bg-white/10 px-4 py-2 text-sm text-emerald-100">
              Built for agriculture. Online and offline. Field to packhouse.
            </div>
            <h1 className="max-w-4xl text-5xl font-black tracking-tight sm:text-6xl lg:text-7xl">
              Run your farm like a world-class operation.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-emerald-100">
              StockIntel Agri brings inventory, usage tracking, packhouse stock, shipping, team permissions,
              expenses, weather, crop and livestock workflows into one production-ready platform.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login?mode=signup"><Button size="lg" className="bg-emerald-400 text-emerald-950 hover:bg-emerald-300">Create farm workspace <ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
              <Link href="/login"><Button size="lg" variant="outline" className="border-white/25 bg-white/10 text-white hover:bg-white/20">Open dashboard</Button></Link>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur">
            <div className="rounded-2xl bg-slate-950/80 p-5">
              <p className="text-sm font-semibold text-emerald-300">Today at North Packhouse</p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {[
                  ['Packed', '1,248 boxes'],
                  ['Reefer stock', '932 boxes'],
                  ['Open requests', '7'],
                  ['Spray window', 'Good'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-white/10 p-4">
                    <p className="text-xs text-emerald-100">{label}</p>
                    <p className="mt-1 text-2xl font-bold">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-50">
                Offline mode ready: cached farm data remains available, and supported writes sync when connectivity returns.
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 pb-10 md:grid-cols-2 lg:grid-cols-3">
          {highlights.map(item => (
            <div key={item.title} className="rounded-2xl border border-white/10 bg-white/10 p-5 backdrop-blur">
              <item.icon className="mb-3 h-6 w-6 text-emerald-300" />
              <h3 className="font-bold">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-emerald-100">{item.text}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
