import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { InventoryItem } from './mock-data';
import type { AccessKey } from './access-permissions';

export type UserRole = 'super_admin' | 'owner' | 'manager' | 'worker';
export type IndustryType = 'pharmacy' | 'agriculture' | 'retail';

// ✅ Updated: Make auto-generated fields optional
export interface StockLocation {
    id: string;
    name: string;
    address: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    phone?: string;
    isDefault: boolean;
    isActive?: boolean;        // ✅ Optional - defaults to true in service
    createdAt?: Date | string; // ✅ Optional - auto-generated in service
}

// ✅ StockTransfer type
export interface StockTransfer {
    id: string;
    organizationId: string;
    fromLocationId: string;
    fromLocationName: string;
    toLocationId: string;
    toLocationName: string;
    items: Array<{
        itemId: string;
        itemName: string;
        sku: string;
        quantity: number;
    }>;
    status: 'pending' | 'in_transit' | 'completed' | 'cancelled';
    createdBy: string;
    requestedAt: Date | string;
    completedAt?: Date | string;
    notes?: string;
}

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
    inventory: InventoryItem[];
    
    // Location/transfer state
    locations: StockLocation[];
    transfers: StockTransfer[];

    // Actions
    logout: () => void;
    setStoreUser: (user: User | null, org?: Organization | null) => void;
    setAuthenticated: (status: boolean) => void;
    setIndustry: (industry: IndustryType) => void;
    setCurrency: (symbol: string) => void;
    updateReceiptSettings: (settings: Partial<AppState['receiptSettings']>) => void;
    updateTaxSettings: (settings: Partial<AppState['taxSettings']>) => void;
    updateInventoryQuantity: (id: string, quantityChange: number) => void;
    setInventory: (items: InventoryItem[]) => void;
    addInventoryItem: (item: InventoryItem) => void;
    
    // Location/transfer actions
    setLocations: (locations: StockLocation[]) => void;
    addLocation: (location: StockLocation) => void;
    updateLocation: (id: string, updates: Partial<StockLocation>) => void;
    setTransfers: (transfers: StockTransfer[]) => void;
    addTransfer: (transfer: StockTransfer) => void;
    updateTransferStatus: (id: string, status: StockTransfer['status']) => void;
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
                email: 'mawuklegodson@gmail.com',
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
            inventory: [],
            
            // Initialize location/transfer state
            locations: [],
            transfers: [],

            setStoreUser: (user, org = null) => set({ user, organization: org, isAuthenticated: !!user }),
            setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),

            logout: () => set({
                user: null,
                organization: null,
                isAuthenticated: false,
                activeIndustry: 'pharmacy',
                inventory: [],
                locations: [],
                transfers: [],
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
            setInventory: (inventory) => set({ inventory }),
            addInventoryItem: (item) => set((state) => ({
                inventory: [...state.inventory.filter(existing => existing.id !== item.id), item]
            })),
            
            // Location actions
            setLocations: (locations) => set({ locations }),
            addLocation: (location) => set((state) => ({
                locations: [...state.locations, location]
            })),
            updateLocation: (id, updates) => set((state) => ({
                locations: state.locations.map(loc =>
                    loc.id === id ? { ...loc, ...updates } : loc
                )
            })),
            
            // Transfer actions
            setTransfers: (transfers) => set({ transfers }),
            addTransfer: (transfer) => set((state) => ({
                transfers: [...state.transfers, transfer]
            })),
            updateTransferStatus: (id, status) => set((state) => ({
                transfers: state.transfers.map(t =>
                    t.id === id ? { ...t, status } : t
                )
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
        }
    )
);
