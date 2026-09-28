import Link from 'next/link';
import type { ReactNode } from 'react';
import { CalendarDays, ChevronDown, ChevronRight, Mail, ShieldCheck } from 'lucide-react';

import { merchantDetails } from '@/lib/legal/merchant';

interface LegalSection {
  id: string;
  title: string;
  content: ReactNode;
}

interface LegalDocumentProps {
  eyebrow: string;
  title: string;
  description: string;
  effectiveDate: string;
  icon: ReactNode;
  sections: LegalSection[];
}

export function LegalText({ children }: { children: ReactNode }) {
  return <p className="text-[0.95rem] leading-7 text-slate-600 sm:text-base">{children}</p>;
}

export function LegalDocument({
  eyebrow,
  title,
  description,
  effectiveDate,
  icon,
  sections,
}: LegalDocumentProps) {
  return (
    <article>
      <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-2 text-sm text-slate-500">
        <Link href="/legal" className="transition-colors hover:text-emerald-700">Legal centre</Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="font-medium text-slate-700">{eyebrow}</span>
      </nav>

      <header className="relative overflow-hidden rounded-3xl border border-emerald-100 bg-white px-6 py-8 shadow-sm sm:px-10 sm:py-11">
        <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-gradient-to-l from-emerald-50 to-transparent sm:block" />
        <div className="relative max-w-3xl">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-sm">
            {icon}
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">{eyebrow}</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">{description}</p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-slate-600">
            <CalendarDays className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            Effective {effectiveDate}
          </div>
        </div>
      </header>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-24">
          <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-semibold text-slate-800">
              Jump to a section
              <ChevronDown className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <nav aria-label="On this page" className="border-t border-slate-100 px-4 py-3">
              <div className="space-y-1">
                {sections.map((section, index) => (
                  <a key={section.id} href={`#${section.id}`} className="flex items-start gap-3 rounded-xl px-2 py-2.5 text-sm text-slate-600 hover:bg-emerald-50 hover:text-emerald-800">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">{index + 1}</span>
                    <span>{section.title}</span>
                  </a>
                ))}
              </div>
            </nav>
          </details>

          <nav aria-label="On this page" className="hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:block">
            <p className="px-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">On this page</p>
            <div className="mt-3 space-y-1">
              {sections.map((section, index) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="flex items-start gap-3 rounded-xl px-2 py-2.5 text-sm text-slate-600 transition-colors hover:bg-emerald-50 hover:text-emerald-800"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">
                    {index + 1}
                  </span>
                  <span>{section.title}</span>
                </a>
              ))}
            </div>
          </nav>

          <div className="hidden rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5 lg:block">
            <ShieldCheck className="h-5 w-5 text-emerald-700" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-slate-900">Need clarification?</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">Our support team can help with policy or account questions.</p>
            <a className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 hover:underline" href={`mailto:${merchantDetails.supportEmail}`}>
              <Mail className="h-4 w-4" aria-hidden="true" /> Contact support
            </a>
          </div>
        </aside>

        <div className="space-y-4">
          {sections.map((section, index) => (
            <section key={section.id} id={section.id} className="scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex items-start gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-sm font-bold text-emerald-800">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-semibold tracking-tight text-slate-950">{section.title}</h2>
                  <div className="mt-4 space-y-4">{section.content}</div>
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}
