// C-356 — Resilient KV read helpers.
// When Upstash is budget-suspended, attempt substrate derivation instead of
// propagating the error to the caller. KV suspension is a performance event,
// not a system failure.

import { kvGetOrThrow } from '@/lib/kv/store';
import { isBudgetSuspensionError } from './kv-errors';

export type ResilientReadResult<T> = {
  value: T | null;
  source: 'kv' | 'fallback' | 'miss';
  kv_suspended?: boolean;
};

/**
 * Read a single KV key. On budget suspension, invoke `fallback` to derive
 * the value from substrate/CPC. On any other error, return miss.
 */
export async function resilientGet<T>(
  key: string,
  fallback: () => Promise<T | null>,
): Promise<ResilientReadResult<T>> {
  try {
    const value = await kvGetOrThrow<T>(key);
    if (value !== null && value !== undefined) {
      return { value, source: 'kv' };
    }
    return { value: null, source: 'miss' };
  } catch (err) {
    if (isBudgetSuspensionError(err)) {
      try {
        const derived = await fallback();
        return { value: derived, source: derived !== null ? 'fallback' : 'miss', kv_suspended: true };
      } catch {
        return { value: null, source: 'miss', kv_suspended: true };
      }
    }
    return { value: null, source: 'miss' };
  }
}

/**
 * Read multiple KV keys in one call. On budget suspension, invoke per-key
 * fallbacks where provided. Returns a flat record plus a suspension flag.
 */
export async function resilientMget<T extends Record<string, unknown>>(
  keys: string[],
  fallbacks: Partial<Record<string, () => Promise<unknown>>>,
): Promise<{ values: T; kv_suspended: boolean }> {
  const results: Record<string, unknown> = {};
  let kv_suspended = false;

  await Promise.all(
    keys.map(async (key) => {
      const r = await resilientGet<unknown>(
        key,
        fallbacks[key] ?? (() => Promise.resolve(null)),
      );
      if (r.kv_suspended) kv_suspended = true;
      results[key] = r.value;
    }),
  );

  return { values: results as T, kv_suspended };
}
