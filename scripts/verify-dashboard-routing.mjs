import assert from 'node:assert/strict';

import { dashboardRouteDestination } from '../lib/dashboard-route-guard.ts';

const future = '2099-01-01T00:00:00.000Z';
const past = '2020-01-01T00:00:00.000Z';
const activeTrial = { plan: 'free_trial', status: 'active', trialEndsAt: future };

const base = {
  authLoading: false,
  isAuthenticated: true,
  user: { organizationId: 'farm-1' },
  organization: { subscription: activeTrial },
  pathname: '/dashboard/agriculture',
  isSuperAdmin: false,
};

assert.equal(dashboardRouteDestination({ ...base, authLoading: true }), null);
assert.equal(dashboardRouteDestination({ ...base, isAuthenticated: false, user: null }), '/login');
assert.equal(dashboardRouteDestination({ ...base, user: { organizationId: '' }, organization: null }), '/onboarding');
assert.equal(
  dashboardRouteDestination({ ...base, organization: null }),
  null,
  'a workspace read or hydration delay must never be presented as a billing problem',
);
assert.equal(dashboardRouteDestination(base), null);
assert.equal(
  dashboardRouteDestination({ ...base, organization: { subscription: { ...activeTrial, trialEndsAt: past } } }),
  '/dashboard/billing',
);
assert.equal(
  dashboardRouteDestination({ ...base, pathname: '/dashboard/billing', organization: { subscription: { ...activeTrial, trialEndsAt: past } } }),
  null,
  'the billing screen must not redirect to itself',
);
assert.equal(
  dashboardRouteDestination({ ...base, pathname: '/dashboard/rewards', organization: { subscription: { ...activeTrial, trialEndsAt: past } } }),
  null,
  'an owner must be able to activate earned credit after a subscription expires',
);
assert.equal(
  dashboardRouteDestination({ ...base, requiredFeature: 'advancedReports' }),
  '/dashboard/billing',
  'a loaded free trial may be upgraded for a paid feature',
);
assert.equal(
  dashboardRouteDestination({ ...base, organization: null, requiredFeature: 'advancedReports' }),
  null,
  'a missing organization must not fail the feature check as though it were a free plan',
);
assert.equal(
  dashboardRouteDestination({ ...base, isSuperAdmin: true, organization: { subscription: { ...activeTrial, trialEndsAt: past } } }),
  null,
);

console.log('Dashboard authentication and subscription routing verified.');
