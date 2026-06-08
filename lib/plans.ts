export type SubscriptionPlan = 'free_trial' | 'pro' | 'enterprise';
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled';
export type PlanFeature = 'bulkImport' | 'ai' | 'advancedReports' | 'team';

export interface SubscriptionLike {
    plan?: SubscriptionPlan;
    status?: SubscriptionStatus;
    trialEndsAt?: Date | string | { toDate?: () => Date } | null;
    currentPeriodEnd?: Date | string | { toDate?: () => Date } | null;
}

export const PLAN_LIMITS = {
    free_trial: { teamMembers: 3, inventoryItems: 100, bulkImport: false, ai: false, advancedReports: false },
    pro: { teamMembers: 25, inventoryItems: 5000, bulkImport: true, ai: true, advancedReports: true },
    enterprise: { teamMembers: Number.POSITIVE_INFINITY, inventoryItems: Number.POSITIVE_INFINITY, bulkImport: true, ai: true, advancedReports: true },
} as const;

function asDate(value: SubscriptionLike['trialEndsAt']): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'object') return value.toDate ? value.toDate() : null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function isSubscriptionActive(subscription?: SubscriptionLike | null): boolean {
    if (!subscription || subscription.status !== 'active') return false;
    const end = subscription.plan === 'free_trial'
        ? asDate(subscription.trialEndsAt)
        : asDate(subscription.currentPeriodEnd);
    return !end || end.getTime() > Date.now();
}

export function canUseFeature(subscription: SubscriptionLike | null | undefined, feature: PlanFeature, isSuperAdmin = false): boolean {
    if (isSuperAdmin) return true;
    if (!isSubscriptionActive(subscription)) return false;
    const plan = subscription?.plan ?? 'free_trial';
    return feature === 'team' ? PLAN_LIMITS[plan].teamMembers > 1 : PLAN_LIMITS[plan][feature];
}

export function getPlanLimit(subscription: SubscriptionLike | null | undefined, limit: 'teamMembers' | 'inventoryItems', isSuperAdmin = false): number {
    if (isSuperAdmin) return Number.POSITIVE_INFINITY;
    return PLAN_LIMITS[subscription?.plan ?? 'free_trial'][limit];
}
