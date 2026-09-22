/**
 * The workspace currency, in the two forms the application needs.
 *
 * Firestore stores whatever symbol the onboarding list offered, and the whole UI
 * prints that string in front of an amount. Postgres stores an ISO code, because
 * `organizations.currency` is `char(3)` with a `currency = upper(currency)` check that
 * rejects `KSh` outright and silently accepts `₦` as a three-byte code that means
 * nothing to a report.
 *
 * So both are kept: a symbol to show a person, a code to put in the column. The
 * picked symbol is preserved alongside the code, so a farm that chose `₵` does not
 * come back as `GHS` after the round trip.
 */

export interface CurrencyOption {
  code: string;
  symbol: string;
  label: string;
}

export const CURRENCY_OPTIONS: CurrencyOption[] = [
  { code: 'GHS', symbol: 'GHS', label: 'GHS — Ghanaian Cedi' },
  { code: 'NGN', symbol: '₦', label: 'NGN — Nigerian Naira' },
  { code: 'KES', symbol: 'KSh', label: 'KES — Kenyan Shilling' },
  { code: 'UGX', symbol: 'UGX', label: 'UGX — Ugandan Shilling' },
  { code: 'TZS', symbol: 'TZS', label: 'TZS — Tanzanian Shilling' },
  { code: 'ZAR', symbol: 'ZAR', label: 'ZAR — South African Rand' },
  { code: 'USD', symbol: '$', label: 'USD — US Dollar' },
  { code: 'GBP', symbol: '£', label: 'GBP — British Pound' },
  { code: 'EUR', symbol: '€', label: 'EUR — Euro' },
  { code: 'INR', symbol: '₹', label: 'INR — Indian Rupee' },
  { code: 'GHS', symbol: '₵', label: 'GHS — Ghana Cedi (₵)' },
];

export const DEFAULT_CURRENCY_CODE = 'GHS';

const BY_SYMBOL = new Map(CURRENCY_OPTIONS.map(option => [option.symbol, option.code]));
const CODES = new Set(CURRENCY_OPTIONS.map(option => option.code));
// The first option for a code is the one shown back to a farm that stored no symbol.
const CANONICAL_SYMBOL = new Map(
  [...CURRENCY_OPTIONS].reverse().map(option => [option.code, option.symbol]),
);

/**
 * The ISO code for a stored value, which may already be a code or may be a symbol the
 * onboarding list used. Symbols are matched first: `KSh` and `UGX` are both three
 * characters, and only one of them is a code.
 */
export function toCurrencyCode(value: string | null | undefined): string {
  const text = (value ?? '').trim();
  if (!text) return DEFAULT_CURRENCY_CODE;

  const bySymbol = BY_SYMBOL.get(text);
  if (bySymbol) return bySymbol;

  const upper = text.toUpperCase();
  if (CODES.has(upper)) return upper;

  // Anything else is a code this list does not carry rather than a symbol; keep it if
  // the column will accept it, because a farm's own currency is not ours to replace.
  return /^[A-Z]{3}$/.test(upper) ? upper : DEFAULT_CURRENCY_CODE;
}

/** What to print in front of an amount. Falls back to the code, which always reads. */
export function toCurrencySymbol(code: string | null | undefined, storedSymbol?: string | null): string {
  const symbol = (storedSymbol ?? '').trim();
  if (symbol) return symbol;
  const text = (code ?? '').trim();
  if (!text) return CANONICAL_SYMBOL.get(DEFAULT_CURRENCY_CODE) ?? DEFAULT_CURRENCY_CODE;
  return CANONICAL_SYMBOL.get(text.toUpperCase()) ?? text;
}
