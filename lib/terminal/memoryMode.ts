/**
 * C-287 — Verified Memory Mode payload for Terminal shell + degraded banner.
 */

import type { GISourceDisplay } from '@/lib/gi/resolveGiChain';

export type MemoryModePayload = {
  degraded: boolean;
  /** Resolved GI from the same chain as snapshot-lite (for header when full snapshot omits top-level `gi`). */
  gi_value: number | null;
  gi_provenance: GISourceDisplay | string | null;
  gi_verified: boolean;
  gi_source: string | null;
  gi_age_seconds: number | null;
  kv_available: boolean;
  kv_latency_ms: number | null;
  backup_redis_available: boolean;
  /** False when snapshot-lite request failed — shell may fall back to integrity lane only */
  lite_ok: boolean;
};

export function provenanceShortLabel(p: string | null | undefined): string {
  const v = p ?? '';
  if (v === 'kv-live' || v === 'live-compute') return 'LIVE';
  if (v === 'kv-carry') return 'CARRY';
  if (v === 'oaa-verified') return 'MEMORY';
  if (v === 'readiness-fallback') return 'CACHED';
  return '—';
}

export function provenanceDescription(p: string | null | undefined): string {
  const v = p ?? '';
  if (v === 'kv-live') return 'GI from fresh KV row (gi:latest).';
  if (v === 'live-compute') return 'GI from live in-process compute (not stale KV).';
  if (v === 'kv-carry') return 'GI from KV carry-forward (primary row stale or missing).';
  if (v === 'oaa-verified') return 'GI from OAA warm-tier mirror (last recorded write).';
  if (v === 'readiness-fallback') return 'GI from MIC readiness snapshot cache.';
  return 'GI unavailable from recorded tiers — no estimate shown.';
}

/** Build from snapshot-lite JSON body (already assembled). */
export function memoryModeFromSnapshotLiteBody(lite: Record<string, unknown> | null | undefined): MemoryModePayload | null {
  if (!lite || typeof lite !== 'object') return null;
  const lanes = lite.lanes as Record<string, unknown> | undefined;
  const integ = lanes?.integrity as Record<string, unknown> | undefined;
  const kv = lanes?.kv as Record<string, unknown> | undefined;
  const backup = lanes?.backup_redis as { available?: boolean } | undefined;

  return {
    degraded: Boolean(lite.degraded),
    gi_value: typeof lite.gi === 'number' && Number.isFinite(lite.gi) ? lite.gi : null,
    gi_provenance: typeof lite.gi_provenance === 'string' ? lite.gi_provenance : null,
    gi_verified: Boolean(lite.gi_verified),
    gi_source: typeof lite.gi_source === 'string' ? lite.gi_source : null,
    gi_age_seconds: typeof integ?.age_seconds === 'number' && Number.isFinite(integ.age_seconds) ? integ.age_seconds : null,
    kv_available: kv?.ok === true,
    kv_latency_ms: typeof kv?.latency_ms === 'number' ? kv.latency_ms : null,
    backup_redis_available: Boolean(backup?.available),
    lite_ok: true,
  };
}

/** When snapshot-lite fails, derive best-effort mode from integrity-status payload. */
export function memoryModeFromIntegrityPayload(data: Record<string, unknown> | null | undefined): MemoryModePayload | null {
  if (!data || typeof data !== 'object') return null;
  const gi =
    typeof data.global_integrity === 'number' && Number.isFinite(data.global_integrity)
      ? data.global_integrity
      : null;
  const prov = typeof data.gi_provenance === 'string' ? data.gi_provenance : null;
  const degraded = Boolean(data.gi_degraded ?? data.degraded);
  return {
    degraded,
    gi_value: gi,
    gi_provenance: prov,
    gi_verified: Boolean(data.gi_verified),
    gi_source: typeof data.source === 'string' ? data.source : null,
    gi_age_seconds: typeof data.gi_age_seconds === 'number' ? data.gi_age_seconds : null,
    kv_available: Boolean(data.kv),
    kv_latency_ms: null,
    backup_redis_available: false,
    lite_ok: false,
  };
}
