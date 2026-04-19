import { createHash } from 'node:crypto';
import { canonicalStringify } from '@/lib/mic/canonicalJson';

export interface HashEnvelope<T = unknown> {
  payload: T;
  hash: string;
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function hashPayload<T>(payload: T): string {
  return sha256Hex(canonicalStringify(payload));
}

export function withHash<T>(payload: T): HashEnvelope<T> {
  return {
    payload,
    hash: hashPayload(payload),
  };
}

export function verifyPayloadHash<T>(payload: T, expectedHash: string): boolean {
  return hashPayload(payload) === expectedHash;
}
