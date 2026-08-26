import { kvGet } from '@/lib/kv/store';
import type { SignalMicroPayload } from '@/app/api/signals/micro/route';

const CACHE_KEY = 'signals:micro:cache:v2';
const CACHE_TTL_MS = 60_000;
/** Facade may serve slightly stale micro cache to avoid blocking on full registry sweep. */
const FACADE_STALE_MS = 120_000;

type CacheEntry = { data: SignalMicroPayload; cachedAt: number };

export type MicroInstrumentLoadResult = {
  payload: SignalMicroPayload | null;
  cached: boolean;
  degraded: boolean;
};

/**
 * KV-only micro instrument load — never HTTP self-fetch (avoids serverless deadlock).
 */
export async function loadMicroInstrumentPayload(): Promise<MicroInstrumentLoadResult> {
  const cached = await kvGet<CacheEntry>(CACHE_KEY);
  const ageMs = cached ? Date.now() - cached.cachedAt : null;

  if (cached && ageMs !== null && ageMs < CACHE_TTL_MS) {
    return {
      payload: cached.data,
      cached: true,
      degraded: false,
    };
  }

  if (cached && ageMs !== null && ageMs < FACADE_STALE_MS) {
    return {
      payload: cached.data,
      cached: true,
      degraded: true,
    };
  }

  if (cached) {
    return {
      payload: cached.data,
      cached: true,
      degraded: true,
    };
  }

  return { payload: null, cached: false, degraded: true };
}
