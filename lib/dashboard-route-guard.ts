import type { PlanFeature, SubscriptionLike } from './plans';
import { canUseFeature, isSubscriptionActive } from './plans';

interface DashboardRouteGuardInput {
    authLoading: boolean;
    isAuthenticated: boolean;
    user: { organizationId: string } | null;
    organization: { subscription?: SubscriptionLike | null } | null;
    pathname: string;
    isSuperAdmin: boolean;
    requiredFeature?: PlanFeature;
}

/**
 * Returns the authentication or subscription destination for a dashboard request.
 * A missing organization is never treated as an unpaid organization: it means either
 * onboarding is unfinished or the workspace could not be loaded yet.
 */
export function dashboardRouteDestination(input: DashboardRouteGuardInput): string | null {
    if (input.authLoading) return null;
    if (!input.user || !input.isAuthenticated) return '/login';
    if (input.isSuperAdmin) return null;

    if (!input.user.organizationId) {
        return '/onboarding';
    }

    const subscription = input.organization?.subscription;
    if (!input.organization || !subscription) return null;

    if (!isSubscriptionActive(subscription)) {
        const recoveryRoutes = ['/dashboard/billing', '/dashboard/rewards'];
        return recoveryRoutes.some(path => input.pathname.startsWith(path)) ? null : '/dashboard/billing';
    }

    if (input.requiredFeature && !canUseFeature(subscription, input.requiredFeature)) {
        return input.pathname === '/dashboard/billing' ? null : '/dashboard/billing';
    }

    return null;
}
