import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MOCK_INVENTORY, InventoryItem } from './mock-data';

export type UserRole = 'owner' | 'manager' | 'worker';
export type IndustryType = 'pharmacy' | 'agriculture' | 'retail';


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
    };
}

export interface User {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    organizationId: string;
    photoURL?: string;
}

interface AppState {
    user: User | null;
    organization: Organization | null; // Added Organization
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
    inventory: InventoryItem[];

    // Actions
    login: (email: string, industry: IndustryType) => void;
    logout: () => void;
    setStoreUser: (user: User | null, org?: Organization | null) => void;
    setAuthenticated: (status: boolean) => void;
    setIndustry: (industry: IndustryType) => void;
    setCurrency: (symbol: string) => void;
    updateReceiptSettings: (settings: Partial<AppState['receiptSettings']>) => void;
    updateTaxSettings: (settings: Partial<AppState['taxSettings']>) => void;
    updateInventoryQuantity: (id: string, quantityChange: number) => void;
    addInventoryItem: (item: InventoryItem) => void;
}

export const useAppStore = create<AppState>()(
    persist(
        (set) => ({
            user: null,
            organization: null,
            activeIndustry: 'pharmacy',
            currency: '$',
            receiptSettings: {
                template: 'thermal',
                businessName: 'StockIntel',
                address: '123 Market Street, City, Country',
                phone: '+1 234 567 890',
                email: 'stockintel01@gmail.com',
                taxId: '29AAAAA0000A1Z5',
                logoUrl: '',
                footerText: 'Thank you for shopping with us!',
                showLogo: true
            },
            taxSettings: {
                enabled: true,
                rate: 18
            },
            isAuthenticated: false,
            inventory: MOCK_INVENTORY,

            setStoreUser: (user, org = null) => set({ user, organization: org }),
            setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),

            login: (email, industry) => {
                // Mock login
                const mockUser: User = {
                    id: '1',
                    name: 'Demo User',
                    email,
                    role: 'owner',
                    organizationId: 'org_1'
                };
                set({ user: mockUser, activeIndustry: industry, isAuthenticated: true });
            },

            logout: () => set({
                user: null,
                organization: null,
                isAuthenticated: false,
                // Reset industry to default so next user gets a clean slate
                activeIndustry: 'pharmacy',
                // Reset inventory to original mock data on logout
                inventory: MOCK_INVENTORY,
            }),

            setIndustry: (industry) => set({ activeIndustry: industry }),
            setCurrency: (currency) => set({ currency }),
            updateReceiptSettings: (settings) => set((state) => ({
                receiptSettings: { ...state.receiptSettings, ...settings }
            })),
            updateTaxSettings: (settings) => set((state) => ({
                taxSettings: { ...state.taxSettings, ...settings }
            })),
            updateInventoryQuantity: (id, quantityChange) => set((state) => ({
                inventory: state.inventory.map(item =>
                    item.id === id
                        ? { ...item, quantity: Math.max(0, item.quantity + quantityChange) }
                        : item
                )
            })),
            addInventoryItem: (item) => set((state) => ({
                inventory: [...state.inventory, item]
            })),
        }),
        {
            name: 'intellistock-storage',
        }
    )
);
