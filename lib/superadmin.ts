/**
 * superadmin.ts
 * Super Admin utilities — all privileged operations gated to SUPER_ADMIN_EMAIL
 */

import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc,
  query, orderBy, limit, where, onSnapshot, serverTimestamp,
  writeBatch, Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const SUPER_ADMIN_EMAIL = 'stockintel01@gmail.com';

export function isSuperAdmin(email?: string | null): boolean {
  return email === SUPER_ADMIN_EMAIL;
}

// ── Types ─────────────────────────────────────────────────────

export interface OrgSummary {
  id: string;
  name: string;
  industry: string;
  ownerId: string;
  ownerEmail?: string;
  ownerName?: string;
  plan: string;
  status: string;
  trialEndsAt?: string;
  memberCount?: number;
  createdAt?: string;
  referralCode?: string;
  invitedByOrgId?: string;
}

export interface UserSummary {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  organizationId: string;
  orgName?: string;
  createdAt?: string;
  lastSignIn?: string;
}

export interface SystemStats {
  totalOrgs: number;
  totalUsers: number;
  activeSubscriptions: number;
  freeTrialOrgs: number;
  proOrgs: number;
  enterpriseOrgs: number;
  expiredOrgs: number;
  industryBreakdown: Record<string, number>;
  recentSignups: OrgSummary[];
}

export interface SystemConfig {
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
    aiConsultationEnabled: boolean;
  };
  maintenance: {
    isMaintenanceMode: boolean;
    maintenanceMessage: string;
  };
  announcements: Array<{
    id: string;
    title: string;
    body: string;
    severity: 'info' | 'warning' | 'critical';
    active: boolean;
    createdAt: string;
  }>;
}

// ── System Config ─────────────────────────────────────────────

export async function getSystemConfig(): Promise<SystemConfig> {
  const snap = await getDoc(doc(db, 'system', 'config'));
  if (snap.exists()) return snap.data() as SystemConfig;
  return getDefaultConfig();
}

export async function saveSystemConfig(config: SystemConfig): Promise<void> {
  await setDoc(doc(db, 'system', 'config'), {
    ...config,
    updatedAt: serverTimestamp(),
    updatedBy: SUPER_ADMIN_EMAIL,
  });
}

export function getDefaultConfig(): SystemConfig {
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
      aiConsultationEnabled: true,
    },
    maintenance: {
      isMaintenanceMode: false,
      maintenanceMessage: 'System maintenance in progress. Back shortly.',
    },
    announcements: [],
  };
}

// ── Organisation Management ───────────────────────────────────

export async function getAllOrganisations(): Promise<OrgSummary[]> {
  const snap = await getDocs(
    query(collection(db, 'organizations'), orderBy('createdAt', 'desc'), limit(500))
  );
  const orgs = snap.docs.map(d => ({
    id: d.id,
    name: d.data().name ?? 'Unnamed',
    industry: d.data().industry ?? 'unknown',
    ownerId: d.data().ownerId ?? '',
    plan: d.data().subscription?.plan ?? 'free_trial',
    status: d.data().subscription?.status ?? 'active',
    trialEndsAt: d.data().subscription?.trialEndsAt?.toDate?.()?.toISOString() ?? d.data().subscription?.trialEndsAt,
    referralCode: d.data().referralCode,
    invitedByOrgId: d.data().invitedByOrgId,
    createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? d.data().createdAt,
  }));
  return orgs;
}

export async function updateOrgPlan(
  orgId: string,
  plan: 'free_trial' | 'pro' | 'enterprise',
  status: 'active' | 'expired' | 'cancelled',
  extendDays?: number,
): Promise<void> {
  const updateData: any = {
    'subscription.plan': plan,
    'subscription.status': status,
    updatedAt: serverTimestamp(),
    updatedBy: SUPER_ADMIN_EMAIL,
  };
  if (extendDays) {
    const newEnd = new Date();
    newEnd.setDate(newEnd.getDate() + extendDays);
    updateData['subscription.currentPeriodEnd'] = Timestamp.fromDate(newEnd);
    updateData['subscription.trialEndsAt'] = Timestamp.fromDate(newEnd);
  }
  await updateDoc(doc(db, 'organizations', orgId), updateData);
}

export async function grantFreeMonths(orgId: string, months: number): Promise<void> {
  const orgRef = doc(db, 'organizations', orgId);
  const orgSnap = await getDoc(orgRef);
  if (!orgSnap.exists()) throw new Error('Organisation not found');

  const extendDate = new Date();
  extendDate.setMonth(extendDate.getMonth() + months);

  await updateDoc(orgRef, {
    'subscription.plan': 'pro',
    'subscription.status': 'active',
    'subscription.currentPeriodEnd': Timestamp.fromDate(extendDate),
    'subscription.grantedBy': SUPER_ADMIN_EMAIL,
    'subscription.grantedAt': serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Write audit log
  await setDoc(doc(db, 'system', 'audit', 'grants', `${orgId}_${Date.now()}`), {
    orgId, months, grantedBy: SUPER_ADMIN_EMAIL, grantedAt: serverTimestamp(),
  });
}

export async function suspendOrganisation(orgId: string, reason: string): Promise<void> {
  await updateDoc(doc(db, 'organizations', orgId), {
    'subscription.status': 'cancelled',
    'subscription.suspendedReason': reason,
    'subscription.suspendedAt': serverTimestamp(),
    'subscription.suspendedBy': SUPER_ADMIN_EMAIL,
    updatedAt: serverTimestamp(),
  });
}

// ── User Management ───────────────────────────────────────────

export async function getAllUsers(): Promise<UserSummary[]> {
  const snap = await getDocs(
    query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(500))
  );
  return snap.docs.map(d => ({
    uid: d.id,
    email: d.data().email ?? '',
    displayName: d.data().displayName ?? '',
    role: d.data().role ?? 'worker',
    organizationId: d.data().organizationId ?? '',
    createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? d.data().createdAt,
  }));
}

export async function updateUserRole(
  uid: string,
  role: 'owner' | 'manager' | 'worker',
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    role,
    updatedAt: serverTimestamp(),
    updatedBy: SUPER_ADMIN_EMAIL,
  });
}

// ── System Stats ──────────────────────────────────────────────

export async function getSystemStats(): Promise<SystemStats> {
  const [orgsSnap, usersSnap] = await Promise.all([
    getDocs(collection(db, 'organizations')),
    getDocs(collection(db, 'users')),
  ]);

  const orgs = orgsSnap.docs.map(d => d.data());
  const industryBreakdown: Record<string, number> = {};
  orgs.forEach(o => {
    const ind = o.industry ?? 'unknown';
    industryBreakdown[ind] = (industryBreakdown[ind] ?? 0) + 1;
  });

  const recentOrgs = orgsSnap.docs.slice(0, 5).map(d => ({
    id: d.id,
    name: d.data().name ?? 'Unnamed',
    industry: d.data().industry ?? 'unknown',
    ownerId: d.data().ownerId ?? '',
    plan: d.data().subscription?.plan ?? 'free_trial',
    status: d.data().subscription?.status ?? 'active',
    createdAt: d.data().createdAt?.toDate?.()?.toISOString(),
  }));

  return {
    totalOrgs: orgsSnap.size,
    totalUsers: usersSnap.size,
    activeSubscriptions: orgs.filter(o => o.subscription?.status === 'active').length,
    freeTrialOrgs: orgs.filter(o => o.subscription?.plan === 'free_trial').length,
    proOrgs: orgs.filter(o => o.subscription?.plan === 'pro').length,
    enterpriseOrgs: orgs.filter(o => o.subscription?.plan === 'enterprise').length,
    expiredOrgs: orgs.filter(o => o.subscription?.status === 'expired').length,
    industryBreakdown,
    recentSignups: recentOrgs,
  };
}

// ── Audit Log ─────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  action: string;
  targetId: string;
  targetType: 'org' | 'user' | 'system';
  details: string;
  performedBy: string;
  performedAt: string;
}

export async function writeAuditLog(
  action: string,
  targetId: string,
  targetType: 'org' | 'user' | 'system',
  details: string,
): Promise<void> {
  await setDoc(doc(collection(db, 'system', 'audit', 'logs')), {
    action, targetId, targetType, details,
    performedBy: SUPER_ADMIN_EMAIL,
    performedAt: serverTimestamp(),
  });
}
