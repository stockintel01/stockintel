import type { IndustryType } from '@/lib/store';

export const INDUSTRY_EXPENSE_CATEGORIES: Record<IndustryType, string[]> = {
  pharmacy: [
    'Medicines & Supplies', 'Regulatory & Licensing', 'Staff & Payroll',
    'Rent & Utilities', 'Delivery & Transport', 'Marketing', 'Maintenance', 'Professional Services',
  ],
  agriculture: [
    'Seeds & Planting', 'Fertilizer & Crop Protection', 'Feed & Veterinary',
    'Labour', 'Fuel & Machinery', 'Transport', 'Utilities', 'Maintenance',
  ],
  retail: [
    'Inventory Procurement', 'Staff & Payroll', 'Rent & Utilities',
    'Logistics', 'Marketing', 'Maintenance', 'Payment Fees', 'Professional Services',
  ],
};

export const EXPENSE_CATEGORY_COLORS = [
  '#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#4f46e5',
];

