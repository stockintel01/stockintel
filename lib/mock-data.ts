export interface InventoryItem {
    id: string;
    name: string;
    sku: string;
    batchNumber: string;
    expiryDate: string;
    quantity: number;
    unit: string;
    mrp: number;
    costPrice: number;
    category: string;
    location: string;
}

export let MOCK_INVENTORY: InventoryItem[] = [
    { id: '1', name: 'Paracetamol 650mg', sku: 'PCM-650', batchNumber: 'B202301', expiryDate: '2025-12-31', quantity: 1500, unit: 'Tablets', mrp: 2.5, costPrice: 1.5, category: 'Medicine', location: 'Rack A1' },
    { id: '2', name: 'Amoxicillin 500mg', sku: 'AMX-500', batchNumber: 'B202305', expiryDate: '2024-10-15', quantity: 300, unit: 'Capsules', mrp: 12.0, costPrice: 8.0, category: 'Antibiotic', location: 'Rack B3' },
    { id: '3', name: 'Vitamin C 500mg', sku: 'VIT-C-500', batchNumber: 'B202311', expiryDate: '2026-01-20', quantity: 800, unit: 'Tablets', mrp: 5.0, costPrice: 3.0, category: 'Supplement', location: 'Rack A2' },
    // Agriculture Mock
    { id: '4', name: 'Urea Fertilizer', sku: 'FERT-UREA', batchNumber: 'F202401', expiryDate: '2026-06-30', quantity: 50, unit: 'Bags (50kg)', mrp: 450.0, costPrice: 380.0, category: 'Fertilizer', location: 'Warehouse 1' },
];

// Helper function to update inventory quantities
export const updateInventoryItem = (id: string, quantityChange: number) => {
    const item = MOCK_INVENTORY.find(i => i.id === id);
    if (item) {
        item.quantity = Math.max(0, item.quantity + quantityChange);
    }
};
