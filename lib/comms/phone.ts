const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export function isE164(value: string): boolean {
  return E164_PATTERN.test(value);
}

/**
 * Normalizes a phone number to E.164. Accepts international formats with or without
 * spacing ("+233 24 123 4567", "00233241234567") and, when a default country code is
 * given, national numbers with a trunk zero ("0241234567").
 */
export function normalizePhoneNumber(input: string, defaultCountryCode?: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (!trimmed.startsWith('+')) {
    if (digits.startsWith('00')) {
      digits = digits.slice(2);
    } else if (digits.startsWith('0')) {
      if (!defaultCountryCode) return null;
      digits = `${defaultCountryCode}${digits.slice(1)}`;
    }
  }

  const candidate = `+${digits}`;
  return isE164(candidate) ? candidate : null;
}

/** WhatsApp identifies senders by `wa_id`: the full number as digits, without a plus. */
export function fromWhatsAppId(waId: string): string | null {
  const digits = waId.replace(/\D/g, '');
  return digits ? normalizePhoneNumber(`+${digits}`) : null;
}

export function toWhatsAppRecipient(address: string): string {
  return address.replace(/\D/g, '');
}

export function maskPhoneNumber(address: string): string {
  if (address.length <= 8) return address;
  return `${address.slice(0, 4)} •••• ${address.slice(-4)}`;
}
