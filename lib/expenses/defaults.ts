import type { IndustryType } from '@/lib/store';

export const INDUSTRY_EXPENSE_CATEGORIES: Record<IndustryType, string[]> = {
  agriculture: [
    'Seeds & Planting', 'Fertilizer & Crop Protection', 'Feed & Veterinary',
    'Labour', 'Fuel & Machinery', 'Transport', 'Utilities', 'Maintenance',
  ],
};

export const EXPENSE_CATEGORY_COLORS = [
  '#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#4f46e5',
];
