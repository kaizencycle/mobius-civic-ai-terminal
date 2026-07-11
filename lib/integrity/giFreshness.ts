import type { GIState } from '@/lib/kv/store';

/** Matches `app/api/vault/status/route.ts` — sweep cron is every 10 min. */
export const GI_FRESHNESS_MICRO_SWEEP_MS = 12 * 60 * 1000;
export const GI_FRESHNESS_DEFAULT_MS = 15 * 60 * 1000;

export function giStateMaxAgeMs(state: GIState): number {
  return state.gi_write_source === 'micro_sweep' ? GI_FRESHNESS_MICRO_SWEEP_MS : GI_FRESHNESS_DEFAULT_MS;
}

export function isGiStateFresh(state: GIState | null | undefined, nowMs = Date.now()): boolean {
  if (!state || typeof state.timestamp !== 'string') return false;
  const ageMs = nowMs - new Date(state.timestamp).getTime();
  if (!Number.isFinite(ageMs)) return false;
  return ageMs < giStateMaxAgeMs(state);
}
