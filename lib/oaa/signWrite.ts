import { createHmac, timingSafeEqual } from 'node:crypto';
import { canonicalStringify } from '@/lib/mic/canonicalJson';

/** HMAC-SHA256 hex over canonical JSON of the signable object (OAA /api/oaa/kv contract). */
export function signOaaWritePayload(payload: Record<string, unknown>, secret: string): string {
  const body = canonicalStringify(payload);
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

export function verifyOaaWritePayload(payload: Record<string, unknown>, signatureHex: string, secret: string): boolean {
  const expected = signOaaWritePayload(payload, secret);
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(signatureHex, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
