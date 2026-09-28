import { NextRequest, NextResponse } from 'next/server';

import { ApiError, requireUser } from '@/lib/api-auth';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { isSupabaseBackendActive } from '@/lib/supabase/config';

type Plan = 'free_trial' | 'pro' | 'enterprise';
type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'expired' | 'cancelled';

interface SystemConfigInput {
  subscriptionPricing: {
    baseUSD: number;
    proPlanMultiplier: number;
    enterprisePlanMultiplier: number;
    freeTrial: { durationDays: number };
  };
  features: {
    maxWorkersFreeTrial: number;
    maxWorkersPro: number;
    maxWorkersEnterprise: number;
    maxInventoryFreeTrial: number;
    maxInventoryPro: number;
    aiInsightsEnabled: boolean;
  };
  maintenance: {
    isMaintenanceMode: boolean;
    maintenanceMessage: string;
  };
  announcements: Array<Record<string, unknown>>;
}

function defaultConfig(): SystemConfigInput {
  return {
    subscriptionPricing: {
      baseUSD: 9,
      proPlanMultiplier: 1,
      enterprisePlanMultiplier: 3,
      freeTrial: { durationDays: 14 },
    },
    features: {
      maxWorkersFreeTrial: 3,
      maxWorkersPro: 25,
      maxWorkersEnterprise: 999,
      maxInventoryFreeTrial: 100,
      maxInventoryPro: 5000,
      aiInsightsEnabled: true,
    },
    maintenance: {
      isMaintenanceMode: false,
      maintenanceMessage: 'System maintenance in progress. Back shortly.',
    },
    announcements: [],
  };
}

function requireSupabaseSuperAdmin(request: NextRequest) {
  if (!isSupabaseBackendActive()) {
    throw new ApiError('This endpoint is available when Supabase is the active backend.', 409);
  }
  return requireUser(request).then(user => {
    if (user.role !== 'super_admin') throw new ApiError('Platform administrator access is required', 403);
    return user;
  });
}

function throwIfError(error: { message?: string } | null, operation: string) {
  if (error) throw new ApiError(`${operation}: ${error.message ?? 'database operation failed'}`, 503);
}

function finiteNumber(value: unknown, label: string, minimum = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum) throw new ApiError(`${label} is invalid`, 400);
  return parsed;
}

function integer(value: unknown, label: string, minimum = 0) {
  const parsed = finiteNumber(value, label, minimum);
  if (!Number.isSafeInteger(parsed)) throw new ApiError(`${label} must be a whole number`, 400);
  return parsed;
}

function isoDate(value: unknown) {
  if (!value) return undefined;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

async function loadConsole() {
  const client = getSupabaseAdminClient();
  const [organizationsResult, subscriptionsResult, profilesResult, membershipsResult, pricesResult, entitlementsResult, configResult] = await Promise.all([
    client.from('organizations')
      .select('id, name, industry, owner_id, referral_code, created_at, archived_at')
      .order('created_at', { ascending: false })
      .limit(500),
    client.from('organization_subscriptions')
      .select('organization_id, plan_id, status, trial_ends_at, current_period_end'),
    client.from('profiles')
      .select('id, email, display_name, default_organization_id, created_at, last_seen_at')
      .limit(1000),
    client.from('organization_memberships')
      .select('organization_id, user_id, role, active, joined_at')
      .eq('active', true)
      .limit(5000),
    client.from('plan_prices')
      .select('plan_id, currency, interval, amount_minor, active')
      .eq('currency', 'USD')
      .eq('interval', 'monthly')
      .eq('active', true),
    client.from('plan_entitlements')
      .select('plan_id, feature_key, enabled, limit_value'),
    client.from('platform_settings')
      .select('value')
      .eq('key', 'system_config')
      .maybeSingle(),
  ]);

  throwIfError(organizationsResult.error, 'Unable to load organizations');
  throwIfError(subscriptionsResult.error, 'Unable to load subscriptions');
  throwIfError(profilesResult.error, 'Unable to load user profiles');
  throwIfError(membershipsResult.error, 'Unable to load memberships');
  throwIfError(pricesResult.error, 'Unable to load plan prices');
  throwIfError(entitlementsResult.error, 'Unable to load plan entitlements');
  throwIfError(configResult.error, 'Unable to load system configuration');

  const subscriptions = new Map((subscriptionsResult.data ?? []).map(row => [String(row.organization_id), row]));
  const profiles = new Map((profilesResult.data ?? []).map(row => [String(row.id), row]));
  const organizationsById = new Map((organizationsResult.data ?? []).map(row => [String(row.id), row]));
  const memberCounts = new Map<string, number>();
  for (const membership of membershipsResult.data ?? []) {
    const organizationId = String(membership.organization_id);
    memberCounts.set(organizationId, (memberCounts.get(organizationId) ?? 0) + 1);
  }

  const organizations = (organizationsResult.data ?? [])
    .filter(row => !row.archived_at)
    .map(row => {
      const subscription = subscriptions.get(String(row.id));
      const owner = profiles.get(String(row.owner_id));
      return {
        id: String(row.id),
        name: String(row.name),
        industry: String(row.industry),
        ownerId: String(row.owner_id),
        ownerEmail: String(owner?.email ?? ''),
        ownerName: String(owner?.display_name ?? ''),
        plan: String(subscription?.plan_id ?? 'free_trial'),
        status: String(subscription?.status ?? 'trialing'),
        trialEndsAt: isoDate(subscription?.trial_ends_at),
        memberCount: memberCounts.get(String(row.id)) ?? 0,
        createdAt: isoDate(row.created_at),
        referralCode: String(row.referral_code ?? ''),
      };
    });

  const users = (membershipsResult.data ?? []).map(membership => {
    const profile = profiles.get(String(membership.user_id));
    const organization = organizationsById.get(String(membership.organization_id));
    return {
      uid: String(membership.user_id),
      email: String(profile?.email ?? ''),
      displayName: String(profile?.display_name ?? ''),
      role: String(membership.role),
      organizationId: String(membership.organization_id),
      orgName: String(organization?.name ?? ''),
      createdAt: isoDate(profile?.created_at),
      lastSignIn: isoDate(profile?.last_seen_at),
    };
  });

  for (const profile of profilesResult.data ?? []) {
    const email = String(profile.email ?? '').toLowerCase();
    if (!['mawuklegodson@gmail.com', 'enochapafloe@gmail.com', 'stockintel01@gmail.com'].includes(email)) continue;
    if (users.some(user => user.uid === String(profile.id))) continue;
    users.push({
      uid: String(profile.id),
      email,
      displayName: String(profile.display_name ?? ''),
      role: 'super_admin',
      organizationId: 'system',
      orgName: 'StockIntel Platform',
      createdAt: isoDate(profile.created_at),
      lastSignIn: isoDate(profile.last_seen_at),
    });
  }

  const stored = configResult.data?.value;
  const config = {
    ...defaultConfig(),
    ...(stored && typeof stored === 'object' ? stored as Partial<SystemConfigInput> : {}),
  } as SystemConfigInput;
  config.subscriptionPricing = {
    ...defaultConfig().subscriptionPricing,
    ...(config.subscriptionPricing ?? {}),
    freeTrial: {
      ...defaultConfig().subscriptionPricing.freeTrial,
      ...(config.subscriptionPricing?.freeTrial ?? {}),
    },
  };
  config.features = { ...defaultConfig().features, ...(config.features ?? {}) };
  config.maintenance = { ...defaultConfig().maintenance, ...(config.maintenance ?? {}) };
  config.announcements = Array.isArray(config.announcements) ? config.announcements : [];

  const proPrice = (pricesResult.data ?? []).find(row => row.plan_id === 'pro');
  const enterprisePrice = (pricesResult.data ?? []).find(row => row.plan_id === 'enterprise');
  if (proPrice) {
    config.subscriptionPricing.baseUSD = Number(proPrice.amount_minor) / 100;
    config.subscriptionPricing.proPlanMultiplier = 1;
  }
  if (enterprisePrice && config.subscriptionPricing.baseUSD > 0) {
    config.subscriptionPricing.enterprisePlanMultiplier = Number(enterprisePrice.amount_minor)
      / (config.subscriptionPricing.baseUSD * 100);
  }

  const entitlement = (plan: Plan, key: string) => (entitlementsResult.data ?? [])
    .find(row => row.plan_id === plan && row.feature_key === key);
  config.features.maxWorkersFreeTrial = Number(entitlement('free_trial', 'team_members')?.limit_value ?? config.features.maxWorkersFreeTrial);
  config.features.maxWorkersPro = Number(entitlement('pro', 'team_members')?.limit_value ?? config.features.maxWorkersPro);
  config.features.maxWorkersEnterprise = Number(entitlement('enterprise', 'team_members')?.limit_value ?? 999);
  config.features.maxInventoryFreeTrial = Number(entitlement('free_trial', 'inventory_items')?.limit_value ?? config.features.maxInventoryFreeTrial);
  config.features.maxInventoryPro = Number(entitlement('pro', 'inventory_items')?.limit_value ?? config.features.maxInventoryPro);
  config.features.aiInsightsEnabled = Boolean(entitlement('pro', 'ai')?.enabled ?? config.features.aiInsightsEnabled);

  const totalOrgs = organizations.length;
  const stats = {
    totalOrgs,
    totalUsers: new Set(users.map(user => user.uid)).size,
    activeSubscriptions: organizations.filter(org => org.status === 'active' || org.status === 'trialing').length,
    freeTrialOrgs: organizations.filter(org => org.plan === 'free_trial').length,
    proOrgs: organizations.filter(org => org.plan === 'pro').length,
    enterpriseOrgs: organizations.filter(org => org.plan === 'enterprise').length,
    expiredOrgs: organizations.filter(org => org.status === 'expired' || org.status === 'cancelled').length,
    industryBreakdown: organizations.reduce<Record<string, number>>((totals, org) => {
      totals[org.industry] = (totals[org.industry] ?? 0) + 1;
      return totals;
    }, {}),
    recentSignups: organizations.slice(0, 5),
  };

  return { organizations, users, stats, config };
}

async function insertAudit(actorId: string, action: string, targetId: string, targetType: string, details: string) {
  const organizationId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId)
    && targetType === 'org'
    ? targetId
    : null;
  const { error } = await getSupabaseAdminClient().from('audit_events').insert({
    organization_id: organizationId,
    actor_id: actorId,
    action,
    entity_type: targetType,
    entity_id: targetId,
    new_record: { details },
  });
  throwIfError(error, 'Unable to write the audit log');
}

async function saveConfig(config: SystemConfigInput, actorId: string) {
  const baseUSD = finiteNumber(config.subscriptionPricing?.baseUSD, 'Base price', 0.5);
  const proMultiplier = finiteNumber(config.subscriptionPricing?.proPlanMultiplier, 'Pro multiplier', 0.01);
  const enterpriseMultiplier = finiteNumber(config.subscriptionPricing?.enterprisePlanMultiplier, 'Enterprise multiplier', 0.01);
  const proAmount = Math.round(baseUSD * proMultiplier * 100);
  const enterpriseAmount = Math.round(baseUSD * enterpriseMultiplier * 100);
  const durationDays = integer(config.subscriptionPricing?.freeTrial?.durationDays, 'Trial duration', 1);
  const limits = {
    maxWorkersFreeTrial: integer(config.features?.maxWorkersFreeTrial, 'Free trial worker limit'),
    maxWorkersPro: integer(config.features?.maxWorkersPro, 'Pro worker limit'),
    maxWorkersEnterprise: integer(config.features?.maxWorkersEnterprise, 'Enterprise worker limit'),
    maxInventoryFreeTrial: integer(config.features?.maxInventoryFreeTrial, 'Free trial inventory limit'),
    maxInventoryPro: integer(config.features?.maxInventoryPro, 'Pro inventory limit'),
  };
  const normalized: SystemConfigInput = {
    ...config,
    subscriptionPricing: {
      ...config.subscriptionPricing,
      baseUSD,
      proPlanMultiplier: proMultiplier,
      enterprisePlanMultiplier: enterpriseMultiplier,
      freeTrial: { durationDays },
    },
    features: { ...config.features, ...limits },
    announcements: Array.isArray(config.announcements) ? config.announcements : [],
  };

  const client = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const [priceResult, entitlementResult, settingResult] = await Promise.all([
    client.from('plan_prices').upsert([
      { plan_id: 'pro', currency: 'USD', interval: 'monthly', amount_minor: proAmount, active: true, updated_at: now },
      { plan_id: 'enterprise', currency: 'USD', interval: 'monthly', amount_minor: enterpriseAmount, active: true, updated_at: now },
    ], { onConflict: 'plan_id,currency,interval' }),
    client.from('plan_entitlements').upsert([
      { plan_id: 'free_trial', feature_key: 'team_members', enabled: true, limit_value: limits.maxWorkersFreeTrial, updated_at: now },
      { plan_id: 'pro', feature_key: 'team_members', enabled: true, limit_value: limits.maxWorkersPro, updated_at: now },
      { plan_id: 'enterprise', feature_key: 'team_members', enabled: true, limit_value: limits.maxWorkersEnterprise >= 999 ? null : limits.maxWorkersEnterprise, updated_at: now },
      { plan_id: 'free_trial', feature_key: 'inventory_items', enabled: true, limit_value: limits.maxInventoryFreeTrial, updated_at: now },
      { plan_id: 'pro', feature_key: 'inventory_items', enabled: true, limit_value: limits.maxInventoryPro, updated_at: now },
      { plan_id: 'pro', feature_key: 'ai', enabled: Boolean(config.features.aiInsightsEnabled), limit_value: null, updated_at: now },
    ], { onConflict: 'plan_id,feature_key' }),
    client.from('platform_settings').upsert({
      key: 'system_config',
      value: normalized,
      description: 'Platform pricing, plan limits, maintenance state and announcements.',
      updated_by: actorId,
      updated_at: now,
    }, { onConflict: 'key' }),
  ]);
  throwIfError(priceResult.error, 'Unable to save plan prices');
  throwIfError(entitlementResult.error, 'Unable to save plan limits');
  throwIfError(settingResult.error, 'Unable to save system configuration');
}

export async function GET(request: NextRequest) {
  try {
    await requireSupabaseSuperAdmin(request);
    return NextResponse.json(await loadConsole());
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load admin data' }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSupabaseSuperAdmin(request);
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? '');
    const client = getSupabaseAdminClient();

    if (action === 'save_config') {
      await saveConfig(body.config as unknown as SystemConfigInput, user.uid);
    } else if (action === 'update_org_plan') {
      const organizationId = String(body.organizationId ?? '');
      const plan = String(body.plan ?? '') as Plan;
      const status = String(body.status ?? '') as SubscriptionStatus;
      if (!['free_trial', 'pro', 'enterprise'].includes(plan)) throw new ApiError('Invalid plan', 400);
      if (!['trialing', 'active', 'past_due', 'expired', 'cancelled'].includes(status)) throw new ApiError('Invalid subscription status', 400);
      const extendDays = integer(body.extendDays ?? 0, 'Extension days');
      const end = extendDays > 0 ? new Date(Date.now() + extendDays * 86_400_000).toISOString() : undefined;
      const values: Record<string, unknown> = { plan_id: plan, status, provider: 'internal', updated_at: new Date().toISOString() };
      if (end) values.current_period_end = end;
      if (plan === 'free_trial' && end) values.trial_ends_at = end;
      const { error } = await client.from('organization_subscriptions').update(values).eq('organization_id', organizationId);
      throwIfError(error, 'Unable to update the organization plan');
    } else if (action === 'grant_months') {
      const organizationId = String(body.organizationId ?? '');
      const months = integer(body.months, 'Months', 1);
      const { data: current, error: currentError } = await client.from('organization_subscriptions')
        .select('current_period_end')
        .eq('organization_id', organizationId)
        .maybeSingle();
      throwIfError(currentError, 'Unable to load the subscription');
      const currentEnd = current?.current_period_end ? new Date(String(current.current_period_end)) : new Date();
      const start = currentEnd.getTime() > Date.now() ? currentEnd : new Date();
      start.setUTCMonth(start.getUTCMonth() + months);
      const { error } = await client.from('organization_subscriptions').update({
        plan_id: 'pro', status: 'active', provider: 'internal', current_period_end: start.toISOString(), updated_at: new Date().toISOString(),
      }).eq('organization_id', organizationId);
      throwIfError(error, 'Unable to grant subscription time');
    } else if (action === 'suspend_org') {
      const organizationId = String(body.organizationId ?? '');
      const reason = String(body.reason ?? '').trim();
      if (!reason) throw new ApiError('A suspension reason is required', 400);
      const { error } = await client.from('organization_subscriptions').update({
        status: 'cancelled', provider: 'internal', updated_at: new Date().toISOString(),
      }).eq('organization_id', organizationId);
      throwIfError(error, 'Unable to suspend the organization');
      await insertAudit(user.uid, 'organization.suspended', organizationId, 'org', reason);
    } else if (action === 'update_user_role') {
      const userId = String(body.userId ?? '');
      const organizationId = String(body.organizationId ?? '');
      const role = String(body.role ?? '');
      if (!['owner', 'manager', 'worker'].includes(role)) throw new ApiError('Invalid role', 400);
      const { data: membership, error: membershipError } = await client.from('organization_memberships')
        .select('role')
        .eq('organization_id', organizationId)
        .eq('user_id', userId)
        .maybeSingle();
      throwIfError(membershipError, 'Unable to load the membership');
      if (!membership) throw new ApiError('Membership not found', 404);
      if (membership.role === 'owner' && role !== 'owner') {
        throw new ApiError('Transfer workspace ownership before changing the owner role', 409);
      }
      const { error } = await client.from('organization_memberships').update({
        role, updated_at: new Date().toISOString(),
      }).eq('organization_id', organizationId).eq('user_id', userId);
      throwIfError(error, 'Unable to update the user role');
    } else if (action === 'write_audit') {
      await insertAudit(
        user.uid,
        String(body.auditAction ?? 'admin.action'),
        String(body.targetId ?? ''),
        String(body.targetType ?? 'system'),
        String(body.details ?? ''),
      );
    } else {
      throw new ApiError('Unsupported admin action', 400);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Admin operation failed' }, { status });
  }
}
