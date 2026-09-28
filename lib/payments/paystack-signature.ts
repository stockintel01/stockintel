import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyPaystackHmac(rawBody: string, signature: string | null, secret: string): boolean {
  if (!secret || !signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
}
