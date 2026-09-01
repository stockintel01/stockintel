'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, BarChart3, Beef, Egg, HeartPulse, Milk, Scale, TrendingDown } from 'lucide-react';

const sections = [
  { label: 'Overview', href: '/dashboard/agriculture/livestock', icon: Beef, exact: true },
  { label: 'Eggs', href: '/dashboard/agriculture/livestock/egg-production', icon: Egg, exact: false },
  { label: 'Feed', href: '/dashboard/agriculture/livestock/feed', icon: Activity, exact: false },
  { label: 'Health', href: '/dashboard/agriculture/livestock/health', icon: HeartPulse, exact: false },
  { label: 'Mortality', href: '/dashboard/agriculture/livestock/mortality', icon: TrendingDown, exact: false },
  { label: 'Growth', href: '/dashboard/agriculture/livestock/growth', icon: Scale, exact: false },
  { label: 'Milk', href: '/dashboard/agriculture/livestock/milk', icon: Milk, exact: false },
  { label: 'Reports', href: '/dashboard/agriculture/livestock/reports', icon: BarChart3, exact: false },
] as const;

export default function LivestockLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();

  return <div className="space-y-5">
    <nav className="sticky top-[4.5rem] z-30 -mx-1 overflow-x-auto border-b bg-background/95 px-1 backdrop-blur print:static" aria-label="Livestock workspace sections">
      <div className="flex min-w-max gap-1">
        {sections.map(section => {
          const active = section.exact ? pathname === section.href : pathname.startsWith(section.href);
          const Icon = section.icon;
          return <Link key={section.href} href={section.href} aria-current={active ? 'page' : undefined} className={`inline-flex h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold ${active ? 'border-green-700 text-green-700' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><Icon className="h-4 w-4" />{section.label}</Link>;
        })}
      </div>
    </nav>
    {children}
  </div>;
}
