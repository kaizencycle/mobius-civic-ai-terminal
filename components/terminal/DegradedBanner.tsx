'use client';

import type { GISourceDisplay } from '@/lib/gi/resolveGiChain';

export type MemoryModePayload = {
  degraded?: boolean;
  gi_provenance?: GISourceDisplay | string | null;
  gi_verified?: boolean;
  gi_source?: string | null;
  gi_age_seconds?: number | null;
  kv_available?: boolean;
  kv_latency_ms?: number | null;
  backup_redis_available?: boolean;
};

function formatAge(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return 'unknown';
  if (sec < 120) return `${Math.round(sec)}s`;
  return `${Math.round(sec / 60)}min`;
}

function message(m: MemoryModePayload): string {
  const prov = (m.gi_provenance ?? '') as GISourceDisplay;
  const kvOk = m.kv_available !== false;
  const backup = Boolean(m.backup_redis_available);

  if (!kvOk && !backup) {
    return 'Primary KV unavailable · backup Redis offline · OAA bridge may apply for continuity reads';
  }
  if (!kvOk && backup) {
    return 'Primary KV unavailable · backup Redis active · continuity reads preserved where mirrored';
  }
  if (prov === 'oaa-verified') {
    return 'GI from OAA verified memory (warm tier) · live KV row stale or missing';
  }
  if (prov === 'readiness-fallback') {
    return `GI from readiness cache · age ${formatAge(m.gi_age_seconds)}`;
  }
  if (prov === 'kv-carry') {
    return 'GI from KV carry-forward row · primary gi:latest stale';
  }
  if (prov === 'unknown') {
    return 'GI unavailable from all recorded tiers · operator truth: no estimate';
  }
  return 'Terminal operating in degraded read mode · check lane diagnostics';
}

export function DegradedBanner({ memoryMode }: { memoryMode: MemoryModePayload | null | undefined }) {
  if (!memoryMode || memoryMode.degraded !== true) return null;
  return (
    <div className="border-b border-amber-500/30 bg-amber-950/50 px-3 py-1.5 text-[11px] text-amber-100/95 md:px-4">
      <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-amber-400 align-middle" aria-hidden />
      <span className="align-middle">{message(memoryMode)}</span>
    </div>
  );
}
