import type { IndustryType, User, UserRole } from '@/lib/store';

export type AccessKey =
    | 'dashboard' | 'expenses' | 'team' | 'rewards' | 'billing' | 'settings'
    | 'agricStock' | 'agricRequests' | 'agricUsage' | 'agricPlanner'
    | 'agricEquipment' | 'agricPacking' | 'agricReports' | 'agricWeather'
    | 'agricLivestock' | 'agricCrops';

export interface AccessDefinition {
    key: AccessKey;
    label: string;
    description: string;
    hrefs: string[];
}

export interface AccessPreset {
    id: string;
    label: string;
    description: string;
    role: 'manager' | 'worker';
    access: AccessKey[];
}

type AccessSubject = Pick<User, 'role' | 'access'>;

export const ACCESS_DEFINITIONS: Record<AccessKey, AccessDefinition> = {
    dashboard: { key: 'dashboard', label: 'Dashboard', description: 'Main overview and daily summary.', hrefs: ['/dashboard', '/dashboard/agriculture'] },
    expenses: { key: 'expenses', label: 'Expenses', description: 'Track budgets and spending.', hrefs: ['/dashboard/expenses'] },
    team: { key: 'team', label: 'Team administration', description: 'Invite staff and manage permitted access.', hrefs: ['/dashboard/team'] },
    rewards: { key: 'rewards', label: 'Rewards', description: 'Owner referral rewards and credits.', hrefs: ['/dashboard/rewards'] },
    billing: { key: 'billing', label: 'Billing', description: 'Owner subscription and billing settings.', hrefs: ['/dashboard/billing'] },
    settings: { key: 'settings', label: 'Farm settings', description: 'Organization settings and operational preferences.', hrefs: ['/dashboard/settings', '/dashboard/settings/receipts'] },
    agricStock: { key: 'agricStock', label: 'Stock Management', description: 'Manage agricultural stock and adjustments.', hrefs: ['/dashboard/agriculture/stock-management'] },
    agricRequests: { key: 'agricRequests', label: 'Stock Requests', description: 'Create, review, dispatch, and receive stock requests.', hrefs: ['/dashboard/agriculture/requests'] },
    agricUsage: { key: 'agricUsage', label: 'Usage Tracker', description: 'Log chemical, seed, and field usage.', hrefs: ['/dashboard/agriculture/usage-tracker'] },
    agricPlanner: { key: 'agricPlanner', label: 'Spray Planner', description: 'Plan applications and stock requirements.', hrefs: ['/dashboard/agriculture/planner'] },
    agricEquipment: { key: 'agricEquipment', label: 'Equipment', description: 'Checkout and return farm equipment.', hrefs: ['/dashboard/agriculture/equipment'] },
    agricPacking: { key: 'agricPacking', label: 'Packhouse', description: 'Packing station stock and shipping records.', hrefs: ['/dashboard/agriculture/packing-station'] },
    agricReports: { key: 'agricReports', label: 'Operations Reports', description: 'View farm-wide agriculture reports.', hrefs: ['/dashboard/agriculture/reports'] },
    agricWeather: { key: 'agricWeather', label: 'Weather', description: 'Farm weather and advisories.', hrefs: ['/dashboard/agriculture/weather'] },
    agricLivestock: { key: 'agricLivestock', label: 'Livestock', description: 'Animal, poultry, feed, health, and production tools.', hrefs: ['/dashboard/agriculture/livestock'] },
    agricCrops: { key: 'agricCrops', label: 'Crops', description: 'Crop planning and crop production records.', hrefs: ['/dashboard/agriculture/crops'] },
};

export const INDUSTRY_ACCESS: Record<IndustryType, AccessKey[]> = {
    agriculture: ['dashboard', 'agricStock', 'agricRequests', 'agricUsage', 'agricPlanner', 'agricEquipment', 'agricPacking', 'agricReports', 'agricWeather', 'agricLivestock', 'agricCrops', 'expenses', 'team', 'rewards', 'billing', 'settings'],
};

export const WORKER_ASSIGNABLE_ACCESS: AccessKey[] = [
    'dashboard', 'agricStock', 'agricRequests', 'agricUsage', 'agricPlanner',
    'agricEquipment', 'agricPacking', 'agricReports', 'agricWeather',
    'agricLivestock', 'agricCrops', 'expenses',
];

export const MANAGER_ASSIGNABLE_ACCESS: AccessKey[] = [
    ...WORKER_ASSIGNABLE_ACCESS,
    'team',
    'settings',
];

export const ACCESS_PRESETS: Record<IndustryType, AccessPreset[]> = {
    agriculture: [
        { id: 'stockkeeper', label: 'Stockkeeper', description: 'Controls inventory, fulfils stock requests, and records issued inputs.', role: 'worker', access: ['dashboard', 'agricStock', 'agricRequests', 'agricUsage'] },
        { id: 'packhouse_supervisor', label: 'Packhouse Supervisor', description: 'Runs packing-station stock, packing, and shipment records.', role: 'worker', access: ['dashboard', 'agricPacking'] },
        { id: 'field_supervisor', label: 'Field Supervisor', description: 'Plans field work, requests inputs, logs usage, and checks weather.', role: 'worker', access: ['dashboard', 'agricRequests', 'agricUsage', 'agricPlanner', 'agricWeather', 'agricCrops'] },
        { id: 'livestock_supervisor', label: 'Livestock Supervisor', description: 'Manages animal production and requests the inputs needed for it.', role: 'worker', access: ['dashboard', 'agricLivestock', 'agricRequests', 'agricWeather'] },
        { id: 'equipment_custodian', label: 'Equipment Custodian', description: 'Tracks equipment availability, checkout, return, and condition.', role: 'worker', access: ['dashboard', 'agricEquipment'] },
        { id: 'finance_officer', label: 'Finance Officer', description: 'Maintains expense records and reviews authorized operations reports.', role: 'worker', access: ['dashboard', 'expenses', 'agricReports'] },
        { id: 'report_viewer', label: 'Reports Viewer', description: 'Read-only navigation to the farm overview and operations reports.', role: 'worker', access: ['dashboard', 'agricReports'] },
        { id: 'farm_manager', label: 'Farm Manager', description: 'Runs farm operations, staff access, expenses, reporting, and farm settings. Billing and owner rewards remain private.', role: 'manager', access: MANAGER_ASSIGNABLE_ACCESS },
    ],
};

export function assignableAccessForRole(role: 'manager' | 'worker', industry: IndustryType): AccessKey[] {
    const roleAccess = role === 'manager' ? MANAGER_ASSIGNABLE_ACCESS : WORKER_ASSIGNABLE_ACCESS;
    const industryAccess = new Set(INDUSTRY_ACCESS[industry]);
    return roleAccess.filter(key => industryAccess.has(key));
}

export function normalizeAccess(access: unknown, industry: IndustryType): AccessKey[] {
    if (!Array.isArray(access)) return [];
    const allowed = new Set(INDUSTRY_ACCESS[industry]);
    return Array.from(new Set(access.filter((key): key is AccessKey => allowed.has(key as AccessKey))));
}

export function normalizeAccessForRole(access: unknown, industry: IndustryType, role: 'manager' | 'worker'): AccessKey[] {
    const allowed = new Set(assignableAccessForRole(role, industry));
    return normalizeAccess(access, industry).filter(key => allowed.has(key));
}

export function defaultAccessForRole(role: 'manager' | 'worker', industry: IndustryType): AccessKey[] {
    const preferredPreset = ACCESS_PRESETS[industry].find(preset =>
        role === 'manager' ? preset.id === 'farm_manager' : preset.id === 'stockkeeper'
    );
    return preferredPreset ? [...preferredPreset.access] : ['dashboard'];
}

export function effectiveAccessForUser(user: AccessSubject | null | undefined, industry: IndustryType = 'agriculture'): AccessKey[] {
    if (!user) return [];
    if (user.role === 'super_admin' || user.role === 'owner') return INDUSTRY_ACCESS[industry];
    if (Array.isArray(user.access)) return normalizeAccessForRole(user.access, industry, user.role);
    return user.role === 'manager' ? defaultAccessForRole('manager', industry) : ['dashboard'];
}

export function canDelegateAccess(actor: AccessSubject, targetRole: 'manager' | 'worker', requestedAccess: AccessKey[], industry: IndustryType = 'agriculture'): boolean {
    const normalized = normalizeAccessForRole(requestedAccess, industry, targetRole);
    if (normalized.length !== requestedAccess.length) return false;
    if (actor.role === 'super_admin' || actor.role === 'owner') return true;
    if (actor.role !== 'manager') return false;
    const actorAccess = new Set(effectiveAccessForUser(actor, industry));
    return normalized.every(key => actorAccess.has(key));
}

export function accessForHrefs(hrefs: string[]): AccessKey[] {
    return Object.values(ACCESS_DEFINITIONS)
        .filter(definition => definition.hrefs.some(href => hrefs.some(item => {
            if (definition.key === 'dashboard') return item === href;
            return item === href || item.startsWith(`${href}/`);
        })))
        .map(definition => definition.key);
}

export function userHasAccess(user: AccessSubject | null | undefined, key: AccessKey): boolean {
    if (!user) return false;
    return effectiveAccessForUser(user).includes(key);
}

export function userCanAccessHref(user: AccessSubject | null | undefined, href: string): boolean {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    const keys = accessForHrefs([href]);
    return keys.length > 0 && keys.some(key => userHasAccess(user, key));
}

export function roleLabel(role: UserRole): string {
    return role === 'super_admin' ? 'Super Admin' : role.charAt(0).toUpperCase() + role.slice(1);
}
