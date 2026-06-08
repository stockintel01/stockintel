'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  ArrowRight, Leaf, Pill, Store, TrendingUp, Package,
  AlertTriangle, Activity, BarChart3, ShoppingCart,
  Users, CheckCircle, ChevronRight, Zap, Shield, Globe
} from 'lucide-react';

type Industry = 'pharmacy' | 'agriculture' | 'retail';

const industryData = {
  pharmacy: {
    label: 'Pharmacy',
    icon: Pill,
    accent: '#2563eb',
    accentLight: '#dbeafe',
    headline: 'Intelligent Pharmacy Management',
    sub: 'AI-powered inventory, drug interactions, and patient safety — built for modern pharmacies.',
    metrics: [
      { label: 'Total Revenue', value: '$45231', trend: '+20.1%', up: true, icon: TrendingUp },
      { label: 'Prescriptions', value: '2,350', trend: '+180', up: true, icon: Activity },
      { label: 'Low Stock Items', value: '12', trend: '−5', up: false, icon: AlertTriangle },
      { label: 'Active Inventory', value: '12,234', trend: '+19', up: true, icon: Package },
    ],
    chart: [24, 28, 32, 29, 35, 42, 45],
    tableRows: [
      { name: 'Paracetamol 650mg', stock: 1500, status: 'Good', price: '$2.50' },
      { name: 'Amoxicillin 500mg', stock: 300, status: 'Expiring', price: '$12.00' },
      { name: 'Vitamin C 500mg', stock: 800, status: 'Good', price: '$5.00' },
    ],
  },
  agriculture: {
    label: 'Agriculture',
    icon: Leaf,
    accent: '#16a34a',
    accentLight: '#dcfce7',
    headline: 'Smart Agriculture Stock Control',
    sub: 'Track fertilizers, seeds, and equipment with seasonal insights for agri-business.',
    metrics: [
      { label: 'Sales Revenue', value: '$124231', trend: '+12.5%', up: true, icon: TrendingUp },
      { label: 'Active Orders', value: '45', trend: '+4', up: true, icon: ShoppingCart },
      { label: 'Low Fertilizer Stock', value: '8', trend: '+2', up: false, icon: AlertTriangle },
      { label: 'Equipment Rented', value: '12', trend: '85%', up: true, icon: Package },
    ],
    chart: [18, 22, 38, 44, 52, 48, 61],
    tableRows: [
      { name: 'Urea Fertilizer 50kg', stock: 50, status: 'Low', price: '$450' },
      { name: 'NPK Complex 40kg', stock: 120, status: 'Good', price: '$680' },
      { name: 'Wheat Seeds 25kg', stock: 200, status: 'Good', price: '$1200' },
    ],
  },
  retail: {
    label: 'Retail',
    icon: Store,
    accent: '#7c3aed',
    accentLight: '#ede9fe',
    headline: 'Next-Gen Retail POS & Inventory',
    sub: 'Universal stock management for general retail with predictive analytics and fast checkout.',
    metrics: [
      { label: 'Daily Sales', value: '$24500', trend: '+10%', up: true, icon: TrendingUp },
      { label: 'Transactions', value: '145', trend: '+12%', up: true, icon: Activity },
      { label: 'Out of Stock', value: '3', trend: '−2', up: true, icon: AlertTriangle },
      { label: 'Total Items', value: '5,432', trend: '+50', up: true, icon: Package },
    ],
    chart: [31, 28, 35, 40, 38, 45, 50],
    tableRows: [
      { name: 'Nike Air Max 90', stock: 24, status: 'Good', price: '$8500' },
      { name: 'Levi\'s 501 Jeans', stock: 8, status: 'Low', price: '$3200' },
      { name: 'Sony WH-1000XM5', stock: 0, status: 'Out', price: '$29990' },
    ],
  },
};

const features = [
  { icon: Zap, title: 'Real-time Sync', desc: 'Inventory updates the moment a sale is made — across every device, instantly.' },
  { icon: Shield, title: 'Role-based Access', desc: 'Owner, Manager, and Worker roles with fine-grained permission controls.' },
  { icon: BarChart3, title: 'AI-Driven Reports', desc: 'Automated profit analysis, trend detection, and custom CSV exports.' },
  { icon: Globe, title: 'Multi-location', desc: 'Manage stock across branches with transfer workflows and consolidated reporting.' },
  { icon: Users, title: 'Team Collaboration', desc: 'Invite staff, track performance targets, and manage shifts from one dashboard.' },
  { icon: ShoppingCart, title: 'Fast POS Billing', desc: 'GST-compliant thermal receipts, barcode scanning, and split payment support.' },
];

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];

export default function LandingPage() {
  const [active, setActive] = useState<Industry>('pharmacy');
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const data = industryData[active];
  const maxChart = Math.max(...data.chart);

  return (
    <div style={{ fontFamily: "'DM Sans', 'Outfit', system-ui, sans-serif", background: '#0a0a0f', color: '#f0f0f5', minHeight: '100vh' }}>

      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        .fade-up { opacity: 0; transform: translateY(20px); animation: fadeUp 0.6s ease forwards; }
        @keyframes fadeUp { to { opacity: 1; transform: none; } }
        .ind-btn { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.5); padding: 8px 18px; border-radius: 999px; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s; }
        .ind-btn:hover { color: #fff; border-color: rgba(255,255,255,0.25); }
        .ind-btn.active { color: #fff; border-color: var(--accent); background: rgba(255,255,255,0.1); box-shadow: 0 0 20px -5px var(--accent); }
        .metric-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 14px 16px; }
        .chart-bar { border-radius: 4px 4px 0 0; transition: all 0.5s cubic-bezier(.4,0,.2,1); }
        .table-row:nth-child(even) { background: rgba(255,255,255,0.03); }
        .status-good { background: rgba(34,197,94,0.15); color: #4ade80; border-radius: 4px; padding: 2px 7px; font-size: 11px; font-weight: 600; }
        .status-low, .status-expiring { background: rgba(251,191,36,0.15); color: #fbbf24; border-radius: 4px; padding: 2px 7px; font-size: 11px; font-weight: 600; }
        .status-out { background: rgba(248,113,113,0.15); color: #f87171; border-radius: 4px; padding: 2px 7px; font-size: 11px; font-weight: 600; }
        .feat-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 28px; transition: all 0.25s; }
        .feat-card:hover { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.15); transform: translateY(-2px); }
        .plan-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 32px; display: flex; flex-direction: column; transition: all 0.2s; }
        .plan-card.highlight { background: rgba(255,255,255,0.07); border-color: var(--accent); box-shadow: 0 0 40px -10px var(--accent); }
        .plan-card:hover { transform: translateY(-3px); }
        .cta-primary { background: var(--accent); color: #fff; border: none; padding: 14px 32px; border-radius: 10px; font-size: 16px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: all 0.2s; text-decoration: none; }
        .cta-primary:hover { opacity: 0.9; transform: translateY(-1px); box-shadow: 0 8px 25px -5px var(--accent); }
        .cta-ghost { background: rgba(255,255,255,0.08); color: #fff; border: 1px solid rgba(255,255,255,0.15); padding: 14px 32px; border-radius: 10px; font-size: 16px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: all 0.2s; text-decoration: none; }
        .cta-ghost:hover { background: rgba(255,255,255,0.14); }
        .nav-link { color: rgba(255,255,255,0.6); text-decoration: none; font-size: 14px; font-weight: 500; transition: color 0.15s; }
        .nav-link:hover { color: #fff; }
        .section-label { font-size: 12px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); margin-bottom: 12px; }
        @media (max-width: 768px) {
          .hero-grid { grid-template-columns: 1fr !important; }
          .feat-grid { grid-template-columns: 1fr !important; }
          .plan-grid { grid-template-columns: 1fr !important; }
          .metric-grid { grid-template-columns: 1fr 1fr !important; }
          .hero-dash { display: none !important; }
        }
      `}</style>

      <div style={{ '--accent': data.accent } as React.CSSProperties}>

        {/* Nav */}
        <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(10,10,15,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ maxWidth: 1160, margin: '0 auto', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, fontSize: 18, color: '#fff' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: data.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, transition: 'background 0.3s' }}>IS</div>
              StockIntel
            </div>
            <nav style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
              <a href="#features" className="nav-link">Features</a>
              <a href="#pricing" className="nav-link">Pricing</a>
            </nav>
            <div style={{ display: 'flex', gap: 10 }}>
              <Link href="/login" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none', padding: '8px 16px', fontSize: 14, fontWeight: 500 }}>Login</Link>
              <Link href="/login" className="cta-primary" style={{ padding: '8px 20px', fontSize: 14 }}>Get Started</Link>
            </div>
          </div>
        </header>

        {/* Hero */}
        <section style={{ maxWidth: 1160, margin: '0 auto', padding: '80px 24px 60px' }}>
          <div className="hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>

            {/* Left — copy */}
            <div>
              <div className="section-label" style={{ '--accent': data.accent } as React.CSSProperties}>
                {data.label} Edition
              </div>

              {/* Industry toggle */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
                {(Object.keys(industryData) as Industry[]).map(ind => (
                  <button key={ind} className={`ind-btn${active === ind ? ' active' : ''}`}
                    style={{ '--accent': industryData[ind].accent } as React.CSSProperties}
                    onClick={() => setActive(ind)}>
                    {industryData[ind].label}
                  </button>
                ))}
              </div>

              <h1 style={{ fontSize: 'clamp(32px,4vw,52px)', fontWeight: 600, lineHeight: 1.15, color: '#fff', marginBottom: 20, letterSpacing: '-0.02em' }}>
                {data.headline}
              </h1>
              <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.55)', lineHeight: 1.65, marginBottom: 40, maxWidth: 440 }}>
                {data.sub}
              </p>

              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <Link href="/login" className="cta-primary">
                  Start Free Trial <ArrowRight size={16} />
                </Link>
                <Link href="/dashboard" className="cta-ghost">
                  View Demo
                </Link>
              </div>

              {/* Social proof */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 48, paddingTop: 40, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>2,400+</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Businesses</div>
                </div>
                <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.1)' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>99.9%</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Uptime</div>
                </div>
                <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.1)' }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>4.9★</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Avg Rating</div>
                </div>
              </div>
            </div>

            {/* Right — live dashboard preview */}
            <div className="hero-dash" style={{ position: 'relative' }}>
              {/* Glow behind */}
              <div style={{ position: 'absolute', inset: -40, background: `radial-gradient(ellipse at 50% 50%, ${data.accent}22 0%, transparent 70%)`, pointerEvents: 'none', transition: 'all 0.5s' }} />

              {/* Browser chrome */}
              <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, overflow: 'hidden', position: 'relative' }}>
                {/* Chrome bar */}
                <div style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
                  </div>
                  <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'DM Mono, monospace' }}>
                    stockintel.app/dashboard
                  </div>
                </div>

                {/* Dashboard interior */}
                <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', minHeight: 380 }}>
                  {/* Sidebar */}
                  <div style={{ background: 'rgba(0,0,0,0.3)', borderRight: '1px solid rgba(255,255,255,0.06)', padding: '16px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: '0 4px' }}>
                      <div style={{ width: 22, height: 22, borderRadius: 5, background: data.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff', transition: 'background 0.3s', flexShrink: 0 }}>IS</div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.7)', lineHeight: 1.2 }}>StockIntel<br />{data.label}</span>
                    </div>
                    {['Overview', 'Inventory', 'Sales (POS)', 'Reports', 'Team', 'Settings'].map((item, i) => (
                      <div key={item} style={{
                        padding: '7px 10px', borderRadius: 6, marginBottom: 2, fontSize: 11,
                        background: i === 0 ? data.accent : 'transparent',
                        color: i === 0 ? '#fff' : 'rgba(255,255,255,0.4)',
                        fontWeight: i === 0 ? 600 : 400,
                        transition: 'background 0.3s',
                      }}>{item}</div>
                    ))}
                  </div>

                  {/* Main content */}
                  <div style={{ padding: 16 }}>
                    {/* Metric cards */}
                    <div className="metric-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                      {data.metrics.slice(0, 4).map((m) => (
                        <div key={m.label} className="metric-card">
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{m.label}</div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', fontFamily: 'DM Mono, monospace' }}>{m.value}</div>
                          <div style={{ fontSize: 10, color: m.up ? '#4ade80' : '#f87171', marginTop: 2 }}>{m.trend}</div>
                        </div>
                      ))}
                    </div>

                    {/* Chart */}
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Revenue Overview</div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 52 }}>
                        {data.chart.map((v, i) => (
                          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <div className="chart-bar" style={{ width: '100%', height: `${(v / maxChart) * 48}px`, background: i === data.chart.length - 1 ? data.accent : 'rgba(255,255,255,0.12)' }} />
                            <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)' }}>{months[i]}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Table */}
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, overflow: 'hidden' }}>
                      <div style={{ padding: '7px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'grid', gridTemplateColumns: '1fr 60px 56px 52px', fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        <span>Item</span><span style={{ textAlign: 'right' }}>Stock</span><span style={{ textAlign: 'center' }}>Status</span><span style={{ textAlign: 'right' }}>MRP</span>
                      </div>
                      {data.tableRows.map((row, i) => (
                        <div key={i} className="table-row" style={{ padding: '7px 10px', display: 'grid', gridTemplateColumns: '1fr 60px 56px 52px', alignItems: 'center' }}>
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>{row.name}</span>
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textAlign: 'right', fontFamily: 'DM Mono, monospace' }}>{row.stock}</span>
                          <span style={{ textAlign: 'center' }}>
                            <span className={`status-${row.status.toLowerCase()}`}>{row.status}</span>
                          </span>
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', textAlign: 'right', fontFamily: 'DM Mono, monospace' }}>{row.price}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" style={{ background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '80px 24px' }}>
          <div style={{ maxWidth: 1160, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 56 }}>
              <div className="section-label">Capabilities</div>
              <h2 style={{ fontSize: 36, fontWeight: 600, color: '#fff', letterSpacing: '-0.02em' }}>Everything you need to run your business</h2>
              <p style={{ color: 'rgba(255,255,255,0.45)', marginTop: 12, fontSize: 17 }}>Tailored tools for {data.label.toLowerCase()} management — and every industry we support.</p>
            </div>
            <div className="feat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {features.map(f => (
                <div key={f.title} className="feat-card">
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: `${data.accent}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, transition: 'background 0.3s' }}>
                    <f.icon size={18} style={{ color: data.accent, transition: 'color 0.3s' }} />
                  </div>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 8 }}>{f.title}</h3>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" style={{ padding: '80px 24px' }}>
          <div style={{ maxWidth: 1000, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 56 }}>
              <div className="section-label">Pricing</div>
              <h2 style={{ fontSize: 36, fontWeight: 600, color: '#fff', letterSpacing: '-0.02em' }}>Simple, transparent pricing</h2>
              <p style={{ color: 'rgba(255,255,255,0.45)', marginTop: 12 }}>Start free. Scale when you're ready.</p>
            </div>
            <div className="plan-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                { name: 'Free Trial', price: '$0', period: '/14 days', features: ['Up to 100 items', '3 team members', 'Basic Inventory', 'POS Billing'], highlight: false },
                { name: 'Professional', price: '$9', period: '/mo', features: ['Up to 5,000 items', '25 team members', 'Advanced Reports', 'Bulk Import', 'AI Features'], highlight: true },
                { name: 'Enterprise', price: '$27', period: '/mo', features: ['Unlimited Inventory', 'Unlimited Team Members', 'All Pro Features', 'Custom Integrations', 'Dedicated Support'], highlight: false },
              ].map(plan => (
                <div key={plan.name} className={`plan-card${plan.highlight ? ' highlight' : ''}`}>
                  {plan.highlight && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: data.accent, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12, transition: 'color 0.3s' }}>Most Popular</div>
                  )}
                  <h3 style={{ fontSize: 20, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{plan.name}</h3>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginBottom: 24 }}>
                    <span style={{ fontSize: 32, fontWeight: 700, color: '#fff', fontFamily: 'DM Mono, monospace' }}>{plan.price}</span>
                    <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>{plan.period}</span>
                  </div>
                  <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32, flex: 1 }}>
                    {plan.features.map(f => (
                      <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'rgba(255,255,255,0.65)' }}>
                        <CheckCircle size={14} style={{ color: data.accent, flexShrink: 0, transition: 'color 0.3s' }} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link href="/login" className={plan.highlight ? 'cta-primary' : 'cta-ghost'} style={{ justifyContent: 'center', width: '100%' }}>
                    {plan.name === 'Enterprise' ? 'Contact Sales' : 'Get Started'}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Banner */}
        <section style={{ padding: '0 24px 80px' }}>
          <div style={{ maxWidth: 1160, margin: '0 auto', background: `linear-gradient(135deg, ${data.accent}22 0%, rgba(255,255,255,0.04) 100%)`, border: `1px solid ${data.accent}44`, borderRadius: 20, padding: '56px 48px', textAlign: 'center', transition: 'all 0.5s' }}>
            <h2 style={{ fontSize: 36, fontWeight: 600, color: '#fff', marginBottom: 16, letterSpacing: '-0.02em' }}>Ready to transform your {data.label.toLowerCase()}?</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 17, marginBottom: 36 }}>Join businesses already running on StockIntel.</p>
            <Link href="/login" className="cta-primary" style={{ fontSize: 17, padding: '16px 40px' }}>
              Start Your Free Trial <ArrowRight size={18} />
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '32px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.25)' }}>© {new Date().getFullYear()} StockIntel. All rights reserved.</div>
        </footer>

      </div>
    </div>
  );
}
