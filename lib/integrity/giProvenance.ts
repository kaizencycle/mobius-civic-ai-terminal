/**
 * C-406 — explicit GI representation metadata for governance consumers.
 */

import type { GIMode } from '@/lib/gi/mode';
import type { GISourceDisplay } from '@/lib/gi/resolveGiChain';

export type GiFreshnessClass = 'fresh' | 'stale' | 'degraded' | 'unknown';

export type GiRepresentation = {
  value: number;
  /** Route / chain tier label (e.g. kv-live, live-compute). */
  computation_source: GISourceDisplay | string;
  /** Legacy bucket from computeIntegrityPayload (kv, cached, live, mock). */
  persistence_source: string;
  computed_at: string | null;
  persisted_at: string | null;
  cache_age_seconds: number | null;
  /** Instrument window identifier when applicable. */
  sample_window: string | null;
  instrument_count: number | null;
  degraded_instrument_count: number | null;
  failed_instrument_count: number | null;
  fallback_usage_count: number | null;
  freshness_class: GiFreshnessClass;
  /** Stored KV mode when it differs from band-derived mode. */
  stored_mode: GIMode | null;
  /** Band-derived mode from numeric GI at read time. */
  derived_mode: GIMode;
  mode_diverged: boolean;
};

export function classifyGiFreshness(args: {
  age_seconds: number | null;
  degraded: boolean;
  source: GISourceDisplay | string;
}): GiFreshnessClass {
  if (args.degraded || args.source === 'kv-carry' || args.source === 'github-state-mirror') {
    return 'degraded';
  }
  if (args.age_seconds === null) return 'unknown';
  if (args.age_seconds <= 120) return 'fresh';
  if (args.age_seconds <= 600) return 'stale';
  return 'degraded';
}

export function buildGiRepresentation(args: {
  value: number;
  computation_source: GISourceDisplay | string;
  persistence_source: string;
  computed_at: string | null;
  persisted_at: string | null;
  cache_age_seconds: number | null;
  degraded: boolean;
  stored_mode: GIMode | null;
  derived_mode: GIMode;
  instrument_count?: number | null;
  degraded_instrument_count?: number | null;
  failed_instrument_count?: number | null;
  fallback_usage_count?: number | null;
  sample_window?: string | null;
}): GiRepresentation {
  return {
    value: args.value,
    computation_source: args.computation_source,
    persistence_source: args.persistence_source,
    computed_at: args.computed_at,
    persisted_at: args.persisted_at,
    cache_age_seconds: args.cache_age_seconds,
    sample_window: args.sample_window ?? null,
    instrument_count: args.instrument_count ?? null,
    degraded_instrument_count: args.degraded_instrument_count ?? null,
    failed_instrument_count: args.failed_instrument_count ?? null,
    fallback_usage_count: args.fallback_usage_count ?? null,
    freshness_class: classifyGiFreshness({
      age_seconds: args.cache_age_seconds,
      degraded: args.degraded,
      source: args.computation_source,
    }),
    stored_mode: args.stored_mode,
    derived_mode: args.derived_mode,
    mode_diverged: args.stored_mode !== null && args.stored_mode !== args.derived_mode,
  };
}
