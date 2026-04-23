import { hashPayload } from '@/lib/mic/hash';

export interface ChainableRecord {
  previous_hash: string | null;
  [key: string]: unknown;
}

export interface ChainedRecord<T extends object> {
  payload: T & { previous_hash: string | null };
  hash: string;
}

export function chainRecord<T extends object>(payload: T, previousHash: string | null): ChainedRecord<T> {
  const chainedPayload = {
    ...payload,
    previous_hash: previousHash,
  };
  return {
    payload: chainedPayload,
    hash: hashPayload(chainedPayload),
  };
}

export function verifyChainLink<T extends object>(
  payload: T & { previous_hash: string | null },
  expectedHash: string,
): boolean {
  return hashPayload(payload) === expectedHash;
}
