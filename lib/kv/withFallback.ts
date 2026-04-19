/**
 * OAA KV bridge is integrated into `kvGet` / `kvSet` / `kvGetRaw` / `kvSetRawKey` in `store.ts`.
 * This module exposes the C-286 spec names as thin aliases for clarity at call sites.
 */

import { kvGet, kvSet } from '@/lib/kv/store';

export async function kvGetWithFallback<T>(key: string): Promise<T | null> {
  return kvGet<T>(key);
}

export async function kvSetWithFallback(
  key: string,
  value: unknown,
  ttlSeconds?: number,
): Promise<boolean> {
  return kvSet(key, value, ttlSeconds);
}
