import type { IndustryType, User } from '@/lib/store';

export type AccessKey =
    | 'dashboard'
    | 'inventory'
    | 'inventoryImport'
    | 'sales'
    | 'customers'
    | 'patients'
    | 'prescriptions'
    | 'consultation'
    | 'pharmacyAnalytics'
    | 'reports'
    | 'expenses'
    | 'team'
    | 'rewards'
    | 'billing'
    | 'settings'
    | 'agricStock'
    | 'agricRequests'
    | 'agricUsage'
    | 'agricPlanner'
    | 'agricEquipment'
    | 'agricPacking'
    | 'agricReports'
    | 'agricWeather'
    | 'agricLivestock'
    | 'agricCrops';

export interface AccessDefinition {
    key: AccessKey;
    label: string;
    description: string;
    hrefs: string[];
}

export interface AccessPreset {
    id: string;
    label: string;
    role: 'manager' | 'worker';
    access: AccessKey[];
}

export const ACCESS_DEFINITIONS: Record<AccessKey, AccessDefinition> = {
    dashboard: { key: 'dashboard', label: 'Dashboard', description: 'Main overview and daily summary.', hrefs: ['/dashboard'] },
    inventory: { key: 'inventory', label: 'Inventory', description: 'View and manage stock records.', hrefs: ['/dashboard/inventory', '/dashboard/inventory/add'] },
    inventoryImport: { key: 'inventoryImport', label: 'Bulk Import', description: 'Upload CSV/XLSX stock files.', hrefs: ['/dashboard/inventory/import'] },
    sales: { key: 'sales', label: 'Sales POS', description: 'Process sales and checkout transactions.', hrefs: ['/dashboard/sales'] },
    customers: { key: 'customers', label: 'Customers', description: 'View and manage customer records.', hrefs: ['/dashboard/customers'] },
    patients: { key: 'patients', label: 'Patients', description: 'View and manage pharmacy patients.', hrefs: ['/dashboard/patients'] },
    prescriptions: { key: 'prescriptions', label: 'Prescriptions', description: 'Digitize and manage prescriptions.', hrefs: ['/dashboard/prescriptions'] },
    consultation: { key: 'consultation', label: 'Consultation AI', description: 'Use AI consultation tools.', hrefs: ['/dashboard/pharmacy/consultation'] },
    pharmacyAnalytics: { key: 'pharmacyAnalytics', label: 'Drug Analytics', description: 'View pharmacy analytics.', hrefs: ['/dashboard/pharmacy/analytics'] },
    reports: { key: 'reports', label: 'Reports', description: 'View business analytics and exports.', hrefs: ['/dashboard/reports'] },
    expenses: { key: 'expenses', label: 'Expenses', description: 'Track budgets and spending.', hrefs: ['/dashboard/expenses'] },
    team: { key: 'team', label: 'Team', description: 'Invite staff and manage access.', hrefs: ['/dashboard/team'] },
    rewards: { key: 'rewards', label: 'Rewards', description: 'Referral rewards and credits.', hrefs: ['/dashboard/rewards'] },
    billing: { key: 'billing', label: 'Billing', description: 'Subscription and billing settings.', hrefs: ['/dashboard/billing'] },
    settings: { key: 'settings', label: 'Settings', description: 'Organization settings and preferences.', hrefs: ['/dashboard/settings', '/dashboard/settings/receipts'] },
    agricStock: { key: 'agricStock', label: 'Stock Management', description: 'Manage agricultural stock and adjustments.', hrefs: ['/dashboard/agriculture/stock-management'] },
    agricRequests: { key: 'agricRequests', label: 'Stock Requests', description: 'Create, approve, dispatch, and receive requests.', hrefs: ['/dashboard/agriculture/requests'] },
    agricUsage: { key: 'agricUsage', label: 'Usage Tracker', description: 'Log chemical, seed, and field usage.', hrefs: ['/dashboard/agriculture/usage-tracker'] },
    agricPlanner: { key: 'agricPlanner', label: 'Spray Planner', description: 'Plan applications and stock requirements.', hrefs: ['/dashboard/agriculture/planner'] },
    agricEquipment: { key: 'agricEquipment', label: 'Equipment', description: 'Checkout and return farm equipment.', hrefs: ['/dashboard/agriculture/equipment'] },
    agricPacking: { key: 'agricPacking', label: 'Packhouse', description: 'Packing station and shipping records.', hrefs: ['/dashboard/agriculture/packing-station'] },
    agricReports: { key: 'agricReports', label: 'Agric Reports', description: 'Agriculture operations reports.', hrefs: ['/dashboard/agriculture/reports'] },
    agricWeather: { key: 'agricWeather', label: 'Weather', description: 'Farm weather and advisories.', hrefs: ['/dashboard/agriculture/weather'] },
    agricLivestock: { key: 'agricLivestock', label: 'Livestock', description: 'Animal, poultry, feed, health, and production tools.', hrefs: ['/dashboard/agriculture/livestock'] },
    agricCrops: { key: 'agricCrops', label: 'Crops', description: 'Crop planning and crop production records.', hrefs: ['/dashboard/agriculture/crops'] },
};

export const INDUSTRY_ACCESS: Record<IndustryType, AccessKey[]> = {
    pharmacy: ['dashboard', 'inventory', 'inventoryImport', 'sales', 'patients', 'prescriptions', 'consultation', 'pharmacyAnalytics', 'reports', 'expenses', 'team', 'rewards', 'billing', 'settings'],
    retail: ['dashboard', 'inventory', 'inventoryImport', 'sales', 'customers', 'reports', 'expenses', 'team', 'rewards', 'billing', 'settings'],
    agriculture: ['dashboard', 'agricStock', 'agricRequests', 'agricUsage', 'agricPlanner', 'agricEquipment', 'agricPacking', 'agricReports', 'agricWeather', 'agricLivestock', 'agricCrops', 'expenses', 'team', 'rewards', 'billing', 'settings'],
};

export const ACCESS_PRESETS: Record<IndustryType, AccessPreset[]> = {
    pharmacy: [
        { id: 'pharmacist', label: 'Pharmacist', role: 'worker', access: ['dashboard', 'inventory', 'sales', 'patients', 'prescriptions', 'consultation'] },
        { id: 'cashier', label: 'Cashier', role: 'worker', access: ['dashboard', 'sales', 'customers'] },
        { id: 'manager', label: 'Pharmacy Manager', role: 'manager', access: INDUSTRY_ACCESS.pharmacy },
    ],
    retail: [
        { id: 'cashier', label: 'Cashier', role: 'worker', access: ['dashboard', 'sales', 'customers'] },
        { id: 'stockkeeper', label: 'Stock Keeper', role: 'worker', access: ['dashboard', 'inventory', 'inventoryImport'] },
        { id: 'manager', label: 'Store Manager', role: 'manager', access: INDUSTRY_ACCESS.retail },
    ],
    agriculture: [
        { id: 'packhouse_supervisor', label: 'Packhouse Supervisor', role: 'worker', access: ['dashboard', 'agricPacking', 'agricReports'] },
        { id: 'stockkeeper', label: 'Stock Keeper', role: 'worker', access: ['dashboard', 'agricStock', 'agricRequests', 'agricUsage'] },
        { id: 'field_supervisor', label: 'Field Supervisor', role: 'worker', access: ['dashboard', 'agricRequests', 'agricUsage', 'agricPlanner', 'agricWeather'] },
        { id: 'farm_manager', label: 'Farm Manager', role: 'manager', access: INDUSTRY_ACCESS.agriculture },
    ],
};

export function normalizeAccess(access: unknown, industry: IndustryType): AccessKey[] {
    if (!Array.isArray(access)) return [];
    const allowed = new Set(INDUSTRY_ACCESS[industry]);
    return Array.from(new Set(access.filter((key): key is AccessKey => allowed.has(key as AccessKey))));
}

export function accessForHrefs(hrefs: string[]): AccessKey[] {
    return Object.values(ACCESS_DEFINITIONS)
        .filter(definition => definition.hrefs.some(href => hrefs.some(item => item === href || item.startsWith(`${href}/`))))
        .map(definition => definition.key);
}

export function userHasAccess(user: User | null | undefined, key: AccessKey): boolean {
    if (!user) return false;
    if (user.role === 'super_admin' || user.role === 'owner') return true;
    if (!user.access) return user.role === 'manager';
    return user.access.includes(key);
}

export function userCanAccessHref(user: User | null | undefined, href: string): boolean {
    if (!user) return false;
    if (user.role === 'super_admin' || user.role === 'owner') return true;
    if (!user.access) return user.role === 'manager';
    const keys = accessForHrefs([href]);
    return keys.length === 0 || keys.some(key => user.access?.includes(key));
}
