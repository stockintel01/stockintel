import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AccessKey } from './access-permissions';
import {
    DEFAULT_SALES_RECEIPT_SETTINGS,
    normalizeSalesReceiptSettings,
    type SalesReceiptSettings,
} from './sales/receipt';

export type UserRole = 'super_admin' | 'owner' | 'manager' | 'worker';
export type IndustryType = 'agriculture';

export interface Organization {
    id: string;
    name: string;
    industry: IndustryType;
    ownerId: string;
    referralCode: string;
    subscription: {
        plan: 'free_trial' | 'pro' | 'enterprise';
        status: 'active' | 'expired' | 'cancelled';
        trialEndsAt: Date | string;
        currentPeriodEnd?: Date | string;
    };
    settings?: Record<string, unknown>;
    currency?: string;
    address?: string;
    phone?: string;
    taxId?: string;
    receiptSettings?: Partial<SalesReceiptSettings>;
}

export interface User {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    organizationId: string;
    photoURL?: string;
    access?: AccessKey[];
    memberships?: TenantMembership[];
}

export interface TenantMembership {
    organizationId: string;
    organizationName?: string;
    industry?: IndustryType;
    role: UserRole;
    access?: AccessKey[];
}

interface AppState {
    user: User | null;
    organization: Organization | null;
    activeIndustry: IndustryType;
    currency: string;
    receiptSettings: SalesReceiptSettings;
    taxSettings: {
        enabled: boolean;
        rate: number;
    };
    isAuthenticated: boolean;
    logout: () => void;
    setStoreUser: (user: User | null, org?: Organization | null) => void;
    setAuthenticated: (status: boolean) => void;
    setIndustry: (industry: IndustryType) => void;
    setCurrency: (symbol: string) => void;
    updateReceiptSettings: (settings: Partial<AppState['receiptSettings']>) => void;
    updateTaxSettings: (settings: Partial<AppState['taxSettings']>) => void;
}

export const useAppStore = create<AppState>()(
    persist(
        (set) => ({
            user: null,
            organization: null,
            activeIndustry: 'agriculture',
            currency: 'GHS',
            receiptSettings: DEFAULT_SALES_RECEIPT_SETTINGS,
            taxSettings: {
                enabled: true,
                rate: 0,
            },
            isAuthenticated: false,
            setStoreUser: (user, org = null) => set((state) => ({
                user,
                organization: org,
                isAuthenticated: !!user,
                currency: org?.currency ?? state.currency,
                receiptSettings: org
                    ? normalizeSalesReceiptSettings(org.receiptSettings, org, user?.email)
                    : user ? state.receiptSettings : DEFAULT_SALES_RECEIPT_SETTINGS,
            })),
            setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
            logout: () => set({
                user: null,
                organization: null,
                isAuthenticated: false,
                activeIndustry: 'agriculture',
                currency: 'GHS',
                receiptSettings: DEFAULT_SALES_RECEIPT_SETTINGS,
            }),
            setIndustry: (industry) => set({ activeIndustry: industry }),
            setCurrency: (currency) => set({ currency }),
            updateReceiptSettings: (settings) => set((state) => ({
                receiptSettings: { ...state.receiptSettings, ...settings },
            })),
            updateTaxSettings: (settings) => set((state) => ({
                taxSettings: { ...state.taxSettings, ...settings },
            })),
        }),
        {
            name: 'intellistock-storage',
            partialize: (state) => ({
                activeIndustry: state.activeIndustry,
                currency: state.currency,
                taxSettings: state.taxSettings,
            }),
        },
    ),
);
