import type { PlanFeature, SubscriptionLike } from './plans';
import { canUseFeature } from './plans';

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
 * Returns the authentication or premium-feature destination for a dashboard request.
 * A missing organization is never treated as an unpaid organization: it means either
 * onboarding is unfinished or the workspace could not be loaded yet.
 *
 * Expired accounts retain access to their workspace and historical records. Paid
 * operations remain protected by API entitlement checks, while premium pages send
 * an owner to Billing only when that specific feature is opened.
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

    if (input.requiredFeature && !canUseFeature(subscription, input.requiredFeature)) {
        return input.pathname === '/dashboard/billing' ? null : '/dashboard/billing';
    }

    return null;
}
