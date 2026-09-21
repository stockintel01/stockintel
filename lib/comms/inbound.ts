import { createHash, randomBytes } from 'node:crypto';

export type InboundCommand =
  | { kind: 'link'; code: string }
  | { kind: 'stop' }
  | { kind: 'start' }
  | { kind: 'help' }
  | { kind: 'none' };

export type LinkOutcome =
  | 'linked'
  | 'already_used'
  | 'expired'
  | 'invalid_code'
  | 'address_in_use'
  | 'wrong_number'
  | 'unknown_connection';

// No 0/O or 1/I/L, so a code read aloud or copied by hand survives the trip.
export const LINK_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const LINK_CODE_LENGTH = 8;

const STOP_KEYWORDS = new Set(['STOP', 'STOP ALL', 'UNSUBSCRIBE', 'OPT OUT', 'OPTOUT']);
const START_KEYWORDS = new Set(['START', 'UNSTOP', 'SUBSCRIBE', 'OPT IN', 'OPTIN']);

/** Keywords must be the whole message, so an ordinary reply that mentions "stop" is not an opt-out. */
export function parseInboundCommand(message: string | null): InboundCommand {
  if (!message) return { kind: 'none' };
  const normalized = message.replace(/\s+/g, ' ').trim().toUpperCase();

  const link = /^JOIN ([A-Z0-9][A-Z0-9 -]{4,14}[A-Z0-9])$/.exec(normalized);
  if (link) {
    const code = normalizeLinkCode(link[1]);
    return code ? { kind: 'link', code } : { kind: 'none' };
  }
  if (STOP_KEYWORDS.has(normalized)) return { kind: 'stop' };
  if (START_KEYWORDS.has(normalized)) return { kind: 'start' };
  if (normalized === 'HELP') return { kind: 'help' };
  return { kind: 'none' };
}

export function normalizeLinkCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== LINK_CODE_LENGTH) return null;
  for (const character of code) {
    if (!LINK_CODE_ALPHABET.includes(character)) return null;
  }
  return code;
}

/** Rejection sampling keeps every character equally likely. */
export function generateLinkCode(nextBytes: (size: number) => Uint8Array = randomBytes): string {
  const alphabetSize = LINK_CODE_ALPHABET.length;
  const unbiasedLimit = 256 - (256 % alphabetSize);
  let code = '';
  while (code.length < LINK_CODE_LENGTH) {
    for (const byte of nextBytes(LINK_CODE_LENGTH * 2)) {
      if (byte >= unbiasedLimit) continue;
      code += LINK_CODE_ALPHABET[byte % alphabetSize];
      if (code.length === LINK_CODE_LENGTH) break;
    }
  }
  return code;
}

export function hashLinkCode(code: string): string {
  return createHash('sha256').update(`stockintel-link:${code}`).digest('hex');
}

export function buildWhatsAppLinkUrl(businessNumber: string, code: string): string {
  return `https://wa.me/${businessNumber.replace(/\D/g, '')}?text=${encodeURIComponent(`JOIN ${code}`)}`;
}

function joinNames(names: string[]): string {
  const unique = Array.from(new Set(names));
  if (unique.length <= 1) return unique[0] ?? 'your farm';
  return `${unique.slice(0, -1).join(', ')} and ${unique[unique.length - 1]}`;
}

export function linkReplyText(outcome: LinkOutcome, organizationName?: string | null): string | null {
  const farm = organizationName || 'your farm';
  switch (outcome) {
    case 'linked':
      return `Connected. You'll get stock alerts from ${farm} here. Reply STOP at any time to pause them.`;
    case 'already_used':
      return 'That code has already been used. Open StockIntel and tap Connect WhatsApp to get a new one.';
    case 'expired':
      return 'That code has expired. Open StockIntel and tap Connect WhatsApp to get a new one.';
    case 'invalid_code':
      return "That code wasn't recognized. Check it matches the one in StockIntel, or tap Connect WhatsApp to get a new one.";
    case 'address_in_use':
      return `This WhatsApp number is already connected to another team member at ${farm}. Ask them to disconnect it in StockIntel first.`;
    case 'wrong_number':
      return 'Your farm sends alerts from a different WhatsApp number. Open StockIntel and use the number shown there.';
    case 'unknown_connection':
      return null;
  }
}

export function stopReplyText(organizationNames: string[]): string {
  return organizationNames.length
    ? `Alerts paused for ${joinNames(organizationNames)}. Reply START to turn them back on.`
    : "You're not receiving StockIntel alerts on this number.";
}

export function startReplyText(organizationNames: string[]): string {
  return organizationNames.length
    ? `Alerts are back on for ${joinNames(organizationNames)}. Reply STOP at any time to pause them.`
    : 'There are no paused alerts for this number. To connect, open StockIntel and tap Connect WhatsApp.';
}

export function helpReplyText(): string {
  return 'This number sends StockIntel farm alerts. To connect, open StockIntel and tap Connect WhatsApp. Reply STOP to pause alerts or START to resume them.';
}
