import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AccessKey } from './access-permissions';

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
    receiptSettings: {
        template: 'thermal' | 'a4' | 'minimal';
        businessName: string;
        address: string;
        phone: string;
        email: string;
        taxId: string;
        logoUrl: string;
        footerText: string;
        showLogo: boolean;
    };
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
            currency: '$',
            receiptSettings: {
                template: 'thermal',
                businessName: 'StockIntel Agri',
                address: '',
                phone: '',
                email: '',
                taxId: '',
                logoUrl: '',
                footerText: 'Thank you.',
                showLogo: true,
            },
            taxSettings: {
                enabled: true,
                rate: 0,
            },
            isAuthenticated: false,
            setStoreUser: (user, org = null) => set({ user, organization: org, isAuthenticated: !!user }),
            setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
            logout: () => set({
                user: null,
                organization: null,
                isAuthenticated: false,
                activeIndustry: 'agriculture',
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
                receiptSettings: state.receiptSettings,
                taxSettings: state.taxSettings,
            }),
        },
    ),
);
