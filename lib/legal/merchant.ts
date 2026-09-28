export const merchantDetails = {
  legalName: process.env.NEXT_PUBLIC_MERCHANT_LEGAL_NAME?.trim() || 'StockIntel Agri',
  tradingName: process.env.NEXT_PUBLIC_MERCHANT_TRADING_NAME?.trim() || 'StockIntel Agri',
  address: process.env.NEXT_PUBLIC_MERCHANT_ADDRESS?.trim() || 'Accra, Ghana',
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || 'stockintel01@gmail.com',
  supportPhone: process.env.NEXT_PUBLIC_SUPPORT_PHONE?.trim() || '',
};

export const LEGAL_EFFECTIVE_DATE = '28 September 2026';
