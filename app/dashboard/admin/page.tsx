'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/lib/store';
import {
  Shield, Settings, DollarSign, Users, Building2, BarChart3,
  RefreshCw, Search, ChevronDown, CheckCircle2, XCircle,
  AlertTriangle, Loader2, Bell, Activity, Globe, X,
  Download, Edit2, Trash2, Gift, Lock, Unlock,
  TrendingUp, Package, Leaf, Pill, Store
} from 'lucide-react';
import {
  isSuperAdmin, getAllOrganisations, getAllUsers, getSystemStats,
  getSystemConfig, saveSystemConfig, updateOrgPlan, grantFreeMonths,
  suspendOrganisation, updateUserRole, writeAuditLog,
  getDefaultConfig,
  type OrgSummary, type UserSummary, type SystemStats, type SystemConfig,
} from '@/lib/superadmin';
import { cn } from '@/lib/utils';

const SUPER_ADMIN_EMAIL = 'stockintel01@gmail.com';

// ── Plan badge ────────────────────────────────────────────────
function PlanBadge({ plan, status }: { plan: string; status: string }) {
  if (status === 'expired' || status === 'cancelled') {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Expired</span>;
  }
  const colors: Record<string, string> = {
    free_trial: 'bg-blue-100 text-blue-700',
    pro:        'bg-green-100 text-green-700',
    enterprise: 'bg-purple-100 text-purple-700',
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[plan] ?? 'bg-gray-100 text-gray-700'}`}>{plan.replace(/_/g, ' ')}</span>;
}

// ── Industry icon ─────────────────────────────────────────────
function IndustryIcon({ industry }: { industry: string }) {
  if (industry === 'pharmacy')    return <Pill    className="w-4 h-4 text-blue-500" />;
  if (industry === 'agriculture') return <Leaf    className="w-4 h-4 text-green-500" />;
  if (industry === 'retail')      return <Store   className="w-4 h-4 text-amber-500" />;
  return <Building2 className="w-4 h-4 text-gray-400" />;
}

// ── Tabs ──────────────────────────────────────────────────────
type Tab = 'overview' | 'organisations' | 'users' | 'config' | 'announcements';

export default function SuperAdminPage() {
  const { user } = useAppStore();

  // Guard — only the super admin email can access this page
  if (!isSuperAdmin(user?.email)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <Shield className="w-5 h-5" /> Access Denied
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              This page is restricted to the StockIntel system administrator.
              If you believe this is an error, contact <strong>{SUPER_ADMIN_EMAIL}</strong>.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [tab, setTab]             = useState<Tab>('overview');
  const [stats, setStats]         = useState<SystemStats | null>(null);
  const [orgs, setOrgs]           = useState<OrgSummary[]>([]);
  const [users, setUsers]         = useState<UserSummary[]>([]);
  const [config, setConfig]       = useState<SystemConfig>(getDefaultConfig());
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [search, setSearch]       = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg]   = useState('');
  const [orgFilter, setOrgFilter] = useState<'all' | 'free_trial' | 'pro' | 'enterprise' | 'expired'>('all');

  // Modals
  const [grantModal, setGrantModal]       = useState<OrgSummary | null>(null);
  const [grantMonths, setGrantMonths]     = useState(1);
  const [suspendModal, setSuspendModal]   = useState<OrgSummary | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [planModal, setPlanModal]         = useState<OrgSummary | null>(null);
  const [newPlan, setNewPlan]             = useState<'free_trial' | 'pro' | 'enterprise'>('pro');

  const notify = (msg: string, isError = false) => {
    if (isError) setErrorMsg(msg);
    else setSuccessMsg(msg);
    setTimeout(() => { setSuccessMsg(''); setErrorMsg(''); }, 4000);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, o, u, cfg] = await Promise.all([
        getSystemStats(),
        getAllOrganisations(),
        getAllUsers(),
        getSystemConfig(),
      ]);
      setStats(s);
      setOrgs(o);
      setUsers(u);
      setConfig(cfg);
    } catch (err: any) {
      notify(err.message || 'Failed to load data', true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Actions ───────────────────────────────────────────────
  async function handleSaveConfig() {
    setSaving(true);
    try {
      await saveSystemConfig(config);
      await writeAuditLog('update_system_config', 'system', 'system', 'System config updated via admin panel');
      notify('System configuration saved successfully!');
    } catch (err: any) { notify(err.message, true); }
    finally { setSaving(false); }
  }

  async function handleGrantMonths() {
    if (!grantModal) return;
    setSaving(true);
    try {
      await grantFreeMonths(grantModal.id, grantMonths);
      await writeAuditLog('grant_free_months', grantModal.id, 'org', `Granted ${grantMonths} months to ${grantModal.name}`);
      notify(`${grantMonths} month(s) granted to ${grantModal.name}`);
      setGrantModal(null);
      loadAll();
    } catch (err: any) { notify(err.message, true); }
    finally { setSaving(false); }
  }

  async function handleChangePlan() {
    if (!planModal) return;
    setSaving(true);
    try {
      await updateOrgPlan(planModal.id, newPlan, 'active', 30);
      await writeAuditLog('change_plan', planModal.id, 'org', `Plan changed to ${newPlan} for ${planModal.name}`);
      notify(`${planModal.name} upgraded to ${newPlan}`);
      setPlanModal(null);
      loadAll();
    } catch (err: any) { notify(err.message, true); }
    finally { setSaving(false); }
  }

  async function handleSuspend() {
    if (!suspendModal || !suspendReason.trim()) return;
    setSaving(true);
    try {
      await suspendOrganisation(suspendModal.id, suspendReason);
      await writeAuditLog('suspend_org', suspendModal.id, 'org', `Suspended: ${suspendReason}`);
      notify(`${suspendModal.name} has been suspended`);
      setSuspendModal(null);
      setSuspendReason('');
      loadAll();
    } catch (err: any) { notify(err.message, true); }
    finally { setSaving(false); }
  }

  async function handleExportOrgs() {
    const rows = [
      ['ID', 'Name', 'Industry', 'Plan', 'Status', 'Created', 'Trial Ends'],
      ...orgs.map(o => [o.id, o.name, o.industry, o.plan, o.status, o.createdAt?.slice(0,10) ?? '', o.trialEndsAt?.slice(0,10) ?? '']),
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
    a.download = `organisations-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }

  // ── Filtered data ─────────────────────────────────────────
  const filteredOrgs = orgs.filter(o => {
    const matchSearch = !search ||
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.id.toLowerCase().includes(search.toLowerCase()) ||
      o.industry.toLowerCase().includes(search.toLowerCase());
    const matchFilter = orgFilter === 'all' ||
      (orgFilter === 'expired' && (o.status === 'expired' || o.status === 'cancelled')) ||
      (orgFilter !== 'expired' && o.plan === orgFilter && o.status !== 'expired');
    return matchSearch && matchFilter;
  });

  const filteredUsers = users.filter(u =>
    !userSearch ||
    u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.displayName.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.uid.includes(userSearch)
  );

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: 'overview',       label: 'Overview',       icon: BarChart3   },
    { id: 'organisations',  label: 'Organisations',  icon: Building2   },
    { id: 'users',          label: 'Users',          icon: Users       },
    { id: 'config',         label: 'System Config',  icon: Settings    },
    { id: 'announcements',  label: 'Announcements',  icon: Bell        },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            Super Admin
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Signed in as <strong>{user?.email}</strong> · Full system access
          </p>
        </div>
        <Button variant="outline" onClick={loadAll} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Toast messages */}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-green-800">
          <CheckCircle2 className="w-4 h-4 text-green-600" /> {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3 text-sm text-red-800">
          <AlertTriangle className="w-4 h-4 text-red-600" /> {errorMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 -mb-px ${
              tab === t.id ? 'border-red-500 text-red-600' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading system data…
        </div>
      )}

      {/* ── OVERVIEW ── */}
      {!loading && tab === 'overview' && stats && (
        <div className="space-y-6">
          {/* KPI Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Organisations', value: stats.totalOrgs,       color: 'border-l-blue-500',   icon: Building2   },
              { label: 'Total Users',          value: stats.totalUsers,      color: 'border-l-green-500',  icon: Users       },
              { label: 'Active Subs',          value: stats.activeSubscriptions, color: 'border-l-purple-500', icon: CheckCircle2 },
              { label: 'Expired',              value: stats.expiredOrgs,     color: 'border-l-red-500',    icon: XCircle     },
            ].map(s => (
              <Card key={s.label} className={`border-l-4 ${s.color}`}>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-3xl font-bold">{s.value}</p>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                    </div>
                    <s.icon className="w-8 h-8 text-muted-foreground/20" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Plan breakdown */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="py-4"><CardTitle className="text-base">Plan Distribution</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: 'Free Trial', count: stats.freeTrialOrgs, total: stats.totalOrgs, color: 'bg-blue-500' },
                  { label: 'Pro',        count: stats.proOrgs,       total: stats.totalOrgs, color: 'bg-green-500' },
                  { label: 'Enterprise', count: stats.enterpriseOrgs,total: stats.totalOrgs, color: 'bg-purple-500' },
                ].map(p => (
                  <div key={p.label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{p.label}</span>
                      <span className="font-semibold">{p.count} ({p.total > 0 ? Math.round((p.count / p.total) * 100) : 0}%)</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div className={`h-full ${p.color} rounded-full`}
                        style={{ width: `${p.total > 0 ? (p.count / p.total) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-4"><CardTitle className="text-base">Industry Breakdown</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(stats.industryBreakdown).sort((a, b) => b[1] - a[1]).map(([ind, count]) => (
                  <div key={ind} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm capitalize">
                      <IndustryIcon industry={ind} /> {ind}
                    </span>
                    <span className="font-semibold text-sm">{count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Recent signups */}
          {stats.recentSignups.length > 0 && (
            <Card>
              <CardHeader className="py-4"><CardTitle className="text-base">Recent Signups</CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b">
                    <tr>{['Organisation', 'Industry', 'Plan', 'Created'].map(h =>
                      <th key={h} className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                    )}</tr>
                  </thead>
                  <tbody className="divide-y">
                    {stats.recentSignups.map(o => (
                      <tr key={o.id} className="hover:bg-muted/30">
                        <td className="px-4 py-2 font-medium">{o.name}</td>
                        <td className="px-4 py-2 capitalize text-muted-foreground">{o.industry}</td>
                        <td className="px-4 py-2"><PlanBadge plan={o.plan} status={o.status} /></td>
                        <td className="px-4 py-2 text-muted-foreground text-xs">{o.createdAt?.slice(0,10) ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── ORGANISATIONS ── */}
      {!loading && tab === 'organisations' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search name, ID, industry…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="border rounded-md px-3 py-2 text-sm bg-background" value={orgFilter} onChange={e => setOrgFilter(e.target.value as any)}>
              <option value="all">All Plans</option>
              <option value="free_trial">Free Trial</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
              <option value="expired">Expired / Suspended</option>
            </select>
            <Button variant="outline" size="sm" onClick={handleExportOrgs}>
              <Download className="w-4 h-4 mr-1" /> Export CSV
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{filteredOrgs.length} of {orgs.length} organisations</p>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b">
                    <tr>{['Organisation', 'Industry', 'Plan', 'Status', 'Trial Ends', 'Created', 'Actions'].map(h =>
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                    )}</tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredOrgs.map(org => (
                      <tr key={org.id} className={`hover:bg-muted/30 ${org.status === 'expired' || org.status === 'cancelled' ? 'bg-red-50/30' : ''}`}>
                        <td className="px-3 py-2">
                          <p className="font-medium">{org.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{org.id.slice(0,12)}…</p>
                        </td>
                        <td className="px-3 py-2 capitalize">
                          <span className="flex items-center gap-1"><IndustryIcon industry={org.industry} />{org.industry}</span>
                        </td>
                        <td className="px-3 py-2"><PlanBadge plan={org.plan} status={org.status} /></td>
                        <td className="px-3 py-2">
                          <span className={`text-xs font-medium ${org.status === 'active' ? 'text-green-600' : 'text-red-600'}`}>
                            {org.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{org.trialEndsAt?.slice(0,10) ?? '—'}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{org.createdAt?.slice(0,10) ?? '—'}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-7 text-xs text-green-700 border-green-300"
                              onClick={() => { setGrantModal(org); setGrantMonths(1); }}>
                              <Gift className="w-3 h-3 mr-0.5" /> Grant
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs"
                              onClick={() => { setPlanModal(org); setNewPlan('pro'); }}>
                              <Edit2 className="w-3 h-3 mr-0.5" /> Plan
                            </Button>
                            {org.status !== 'cancelled' && (
                              <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-300"
                                onClick={() => { setSuspendModal(org); setSuspendReason(''); }}>
                                <Lock className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredOrgs.length === 0 && (
                      <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">No organisations found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── USERS ── */}
      {!loading && tab === 'users' && (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search email, name, UID…" value={userSearch} onChange={e => setUserSearch(e.target.value)} />
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b">
                    <tr>{['User', 'Email', 'Role', 'Organisation', 'Joined', 'Actions'].map(h =>
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                    )}</tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredUsers.map(u => (
                      <tr key={u.uid} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">{u.displayName || '—'}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{u.email}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            u.role === 'super_admin' ? 'bg-red-100 text-red-700' :
                            u.role === 'owner'   ? 'bg-purple-100 text-purple-700' :
                            u.role === 'manager' ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>{u.role}</span>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground font-mono">{u.organizationId.slice(0,10)}…</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{u.createdAt?.slice(0,10) ?? '—'}</td>
                        <td className="px-3 py-2">
                          <select className="text-xs border rounded px-1.5 py-1 bg-background"
                            value={u.role}
                            onChange={async e => {
                              try {
                                await updateUserRole(u.uid, e.target.value as any);
                                await writeAuditLog('change_role', u.uid, 'user', `Role changed to ${e.target.value}`);
                                notify(`${u.displayName} role updated`);
                                loadAll();
                              } catch (err: any) { notify(err.message, true); }
                            }}
                            disabled={u.email === SUPER_ADMIN_EMAIL}>
                            <option value="owner">owner</option>
                            <option value="manager">manager</option>
                            <option value="worker">worker</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">No users found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── SYSTEM CONFIG ── */}
      {!loading && tab === 'config' && (
        <div className="space-y-6 max-w-3xl">
          {/* Pricing */}
          <Card>
            <CardHeader className="py-4"><CardTitle className="flex items-center gap-2"><DollarSign className="w-5 h-5" /> Subscription Pricing</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-3 gap-4">
              {[
                { label: 'Base Price (USD/mo)', key: 'baseUSD', step: '0.01' },
                { label: 'Pro Multiplier', key: 'proPlanMultiplier', step: '0.1' },
                { label: 'Enterprise Multiplier', key: 'enterprisePlanMultiplier', step: '0.1' },
              ].map(f => (
                <div key={f.key} className="space-y-1.5">
                  <label className="text-sm font-medium">{f.label}</label>
                  <Input type="number" step={f.step}
                    value={(config.subscriptionPricing as any)[f.key]}
                    onChange={e => setConfig(prev => ({ ...prev, subscriptionPricing: { ...prev.subscriptionPricing, [f.key]: parseFloat(e.target.value) || 0 } }))} />
                  {f.key !== 'baseUSD' && (
                    <p className="text-xs text-muted-foreground">= ${(config.subscriptionPricing.baseUSD * (config.subscriptionPricing as any)[f.key]).toFixed(2)}/mo</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Feature Limits */}
          <Card>
            <CardHeader className="py-4"><CardTitle className="flex items-center gap-2"><Settings className="w-5 h-5" /> Feature Limits</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-3 gap-4">
              {[
                { label: 'Free Trial: Max Workers', key: 'maxWorkersFreeTrial' },
                { label: 'Pro: Max Workers',        key: 'maxWorkersPro' },
                { label: 'Enterprise: Max Workers', key: 'maxWorkersEnterprise' },
                { label: 'Free Trial: Max Inventory', key: 'maxInventoryFreeTrial' },
                { label: 'Pro: Max Inventory', key: 'maxInventoryPro' },
              ].map(f => (
                <div key={f.key} className="space-y-1.5">
                  <label className="text-sm font-medium">{f.label}</label>
                  <Input type="number"
                    value={(config.features as any)[f.key]}
                    onChange={e => setConfig(prev => ({ ...prev, features: { ...prev.features, [f.key]: parseInt(e.target.value) || 0 } }))} />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Maintenance Mode */}
          <Card className={config.maintenance.isMaintenanceMode ? 'border-red-300' : ''}>
            <CardHeader className="py-4"><CardTitle className="flex items-center gap-2 text-red-700"><AlertTriangle className="w-5 h-5" /> Maintenance Mode</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={config.maintenance.isMaintenanceMode}
                  onChange={e => setConfig(prev => ({ ...prev, maintenance: { ...prev.maintenance, isMaintenanceMode: e.target.checked } }))} />
                <span className="font-medium">Enable maintenance mode (blocks all user access)</span>
              </label>
              <div>
                <label className="text-sm font-medium">Maintenance Message</label>
                <Input className="mt-1" value={config.maintenance.maintenanceMessage}
                  onChange={e => setConfig(prev => ({ ...prev, maintenance: { ...prev.maintenance, maintenanceMessage: e.target.value } }))} />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSaveConfig} disabled={saving} size="lg" className="bg-red-600 hover:bg-red-700">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Shield className="w-4 h-4 mr-2" />}
              Save System Config
            </Button>
          </div>
        </div>
      )}

      {/* ── ANNOUNCEMENTS ── */}
      {!loading && tab === 'announcements' && (
        <div className="space-y-4 max-w-2xl">
          <p className="text-sm text-muted-foreground">Post system-wide announcements visible to all users on login.</p>
          {(config.announcements ?? []).length === 0 && (
            <div className="text-center py-12 border-2 border-dashed rounded-xl text-muted-foreground">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>No active announcements</p>
            </div>
          )}
          {(config.announcements ?? []).map((ann, i) => (
            <Card key={ann.id} className={ann.severity === 'critical' ? 'border-red-300' : ann.severity === 'warning' ? 'border-amber-300' : 'border-blue-300'}>
              <CardContent className="pt-4 flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{ann.title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{ann.body}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block font-medium ${ann.severity === 'critical' ? 'bg-red-100 text-red-700' : ann.severity === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{ann.severity}</span>
                </div>
                <Button size="sm" variant="ghost" className="text-red-500 h-7"
                  onClick={() => setConfig(prev => ({ ...prev, announcements: prev.announcements.filter((_, j) => j !== i) }))}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
          <Card>
            <CardHeader className="py-3"><CardTitle className="text-sm">New Announcement</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Title" id="ann-title" />
              <textarea className="w-full border rounded-md px-3 py-2 text-sm resize-none" rows={2} id="ann-body" placeholder="Message body…" />
              <select className="border rounded-md px-3 py-2 text-sm bg-background w-full" id="ann-severity">
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
              <Button onClick={() => {
                const title = (document.getElementById('ann-title') as HTMLInputElement).value;
                const body  = (document.getElementById('ann-body') as HTMLTextAreaElement).value;
                const sev   = (document.getElementById('ann-severity') as HTMLSelectElement).value as any;
                if (!title || !body) return;
                setConfig(prev => ({
                  ...prev,
                  announcements: [...(prev.announcements ?? []), { id: Date.now().toString(), title, body, severity: sev, active: true, createdAt: new Date().toISOString() }]
                }));
                (document.getElementById('ann-title') as HTMLInputElement).value = '';
                (document.getElementById('ann-body') as HTMLTextAreaElement).value = '';
              }}>Add Announcement</Button>
            </CardContent>
          </Card>
          <div className="flex justify-end">
            <Button onClick={handleSaveConfig} disabled={saving} className="bg-red-600 hover:bg-red-700">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Save Announcements
            </Button>
          </div>
        </div>
      )}

      {/* ── MODALS ── */}

      {/* Grant months modal */}
      {grantModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-sm">
            <CardHeader><CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2"><Gift className="w-4 h-4 text-green-600" /> Grant Free Months</span>
              <button onClick={() => setGrantModal(null)}><X className="w-4 h-4" /></button>
            </CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Grant free Pro months to <strong>{grantModal.name}</strong>. This upgrades them to Pro and extends their subscription.</p>
              <div>
                <label className="text-sm font-medium">Number of Months</label>
                <div className="flex gap-2 mt-1">
                  {[1, 3, 6, 12].map(m => (
                    <button key={m} onClick={() => setGrantMonths(m)}
                      className={`flex-1 border rounded-lg py-2 text-sm font-medium transition-colors ${grantMonths === m ? 'bg-green-600 text-white border-green-600' : 'hover:bg-muted'}`}>{m}mo</button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setGrantModal(null)}>Cancel</Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={handleGrantMonths} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : `Grant ${grantMonths} Month${grantMonths > 1 ? 's' : ''}`}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Change plan modal */}
      {planModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-sm">
            <CardHeader><CardTitle className="flex items-center justify-between">
              <span>Change Plan — {planModal.name}</span>
              <button onClick={() => setPlanModal(null)}><X className="w-4 h-4" /></button>
            </CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {(['free_trial', 'pro', 'enterprise'] as const).map(p => (
                  <button key={p} onClick={() => setNewPlan(p)}
                    className={`border rounded-lg py-2.5 text-xs font-medium capitalize transition-colors ${newPlan === p ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                    {p.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Plan will be active for 30 days from today.</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setPlanModal(null)}>Cancel</Button>
                <Button className="flex-1" onClick={handleChangePlan} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply Change'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Suspend modal */}
      {suspendModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-sm">
            <CardHeader><CardTitle className="flex items-center justify-between text-red-700">
              <span className="flex items-center gap-2"><Lock className="w-4 h-4" /> Suspend Organisation</span>
              <button onClick={() => setSuspendModal(null)}><X className="w-4 h-4" /></button>
            </CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Suspending <strong>{suspendModal.name}</strong> will block all user access. Provide a reason:</p>
              <textarea className="w-full border rounded-md px-3 py-2 text-sm resize-none border-red-200" rows={3}
                placeholder="Reason for suspension (visible in audit log)…"
                value={suspendReason} onChange={e => setSuspendReason(e.target.value)} />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setSuspendModal(null)}>Cancel</Button>
                <Button variant="destructive" className="flex-1" onClick={handleSuspend} disabled={saving || !suspendReason.trim()}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm Suspend'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
