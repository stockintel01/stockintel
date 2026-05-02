import { Organization } from '@/lib/store';

// Pricing configuration
export const PRICING = {
    BASE_USD: 5, // $5/month base price
    CURRENCY_API: 'https://api.exchangerate-api.com/v4/latest/USD'
};

// Convert USD price to target currency
export async function convertPrice(usdAmount: number, targetCurrency: string): Promise<number> {
    if (targetCurrency === '$' || targetCurrency === 'USD') {
        return usdAmount;
    }

    try {
        const response = await fetch(PRICING.CURRENCY_API);
        const data = await response.json();

        // Map currency symbols to codes
        const currencyMap: Record<string, string> = {
            '$': 'USD',
            '€': 'EUR',
            '£': 'GBP',
            '¥': 'JPY',
            '₹': 'INR',
            'NGN': 'NGN',
            'ZAR': 'ZAR'
        };

        const currencyCode = currencyMap[targetCurrency] || targetCurrency;
        const rate = data.rates[currencyCode];

        if (!rate) {
            console.warn(`Currency ${currencyCode} not found, using USD`);
            return usdAmount;
        }

        return Math.round(usdAmount * rate * 100) / 100;
    } catch (error) {
        console.error('Failed to fetch exchange rates:', error);
        return usdAmount;
    }
}

// Format price with currency symbol
export function formatPrice(amount: number, currency: string): string {
    return `${currency}${amount.toFixed(2)}`;
}
