'use client';

import Link from 'next/link';
import { CloudSun, Droplets } from 'lucide-react';

export function WeatherWorkspaceNav({ active }: { active: 'forecast' | 'water' }) {
  const items = [
    { id: 'forecast' as const, label: 'Forecast & advice', href: '/dashboard/agriculture/weather', icon: CloudSun },
    { id: 'water' as const, label: 'Rainfall & irrigation', href: '/dashboard/agriculture/weather/water-balance', icon: Droplets },
  ];
  return <nav className="sticky top-[4.5rem] z-30 -mx-1 overflow-x-auto border-b bg-background/95 px-1 backdrop-blur print:static" aria-label="Weather and irrigation sections"><div className="flex min-w-max gap-1">{items.map(item => <Link key={item.id} href={item.href} aria-current={active === item.id ? 'page' : undefined} className={`inline-flex h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors ${active === item.id ? 'border-blue-700 text-blue-700' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><item.icon className="h-4 w-4" />{item.label}</Link>)}</div></nav>;
}
