/**
 * C-286 — single GI resolution for MIC readiness, snapshot-lite, and ops surfaces.
 */

import type { GIMode } from '@/lib/gi/mode';
import { computeIntegrityPayload } from '@/lib/integrity/buildStatus';
import { loadGIState, loadGIStateCarry, type GIState } from '@/lib/kv/store';

export type GiResolutionSource =
  | 'kv'
  | 'kv_carry_forward'
  | 'live_compute'
  | 'readiness_snapshot'
  | 'null';

export type ResolvedGi = {
  gi: number | null;
  mode: GIMode | string | null;
  terminal_status: string | null;
  primary_driver: string | null;
  source: GiResolutionSource;
  timestamp: string | null;
  /** When `source === 'kv'`, the underlying row (for staleness / carry-forward flags). */
  kv?: GIState | null;
};

function modeFromGi(gi: number): GIMode {
  if (gi >= 0.85) return 'green';
  if (gi >= 0.7) return 'yellow';
  return 'red';
}

function parseMicReadinessSnapshotGi(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  let o: Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof raw === 'object') {
    o = raw as Record<string, unknown>;
  } else {
    return null;
  }
  const nested = o.snapshot && typeof o.snapshot === 'object' ? (o.snapshot as Record<string, unknown>) : o;
  const g = nested.gi;
  if (typeof g === 'number' && Number.isFinite(g)) return Math.max(0, Math.min(1, g));
  return null;
}

/**
 * Resolve GI: prefer fresh-enough KV, else live `computeIntegrityPayload`, else MIC readiness snapshot body.
 */
export async function resolveGiForTerminal(opts?: {
  micReadinessSnapshotRaw?: string | null;
}): Promise<ResolvedGi> {
  const st = await loadGIState();
  if (st && typeof st.global_integrity === 'number' && Number.isFinite(st.global_integrity)) {
    const age = Date.now() - new Date(st.timestamp).getTime();
    if (age < 15 * 60 * 1000) {
      return {
        gi: Math.max(0, Math.min(1, st.global_integrity)),
        mode: st.mode ?? null,
        terminal_status: st.terminal_status ?? null,
        primary_driver: st.primary_driver ?? null,
        source: 'kv',
        timestamp: st.timestamp,
        kv: st,
      };
    }
  }

  try {
    const live = await computeIntegrityPayload();
    return {
      gi: live.global_integrity,
      mode: live.mode,
      terminal_status: live.terminal_status,
      primary_driver: live.primary_driver,
      source: 'live_compute',
      timestamp: live.timestamp,
      kv: st,
    };
  } catch {
    // fall through
  }

  const carry = await loadGIStateCarry();
  if (carry && typeof carry.global_integrity === 'number' && Number.isFinite(carry.global_integrity)) {
    return {
      gi: Math.max(0, Math.min(1, carry.global_integrity)),
      mode: carry.mode ?? null,
      terminal_status: carry.terminal_status ?? null,
      primary_driver: `${carry.primary_driver ?? 'GI'} (carried forward; primary gi:latest missing or stale)`,
      source: 'kv_carry_forward',
      timestamp: carry.timestamp,
      kv: st,
    };
  }

  const snapGi =
    opts?.micReadinessSnapshotRaw != null ? parseMicReadinessSnapshotGi(opts.micReadinessSnapshotRaw) : null;
  if (snapGi !== null) {
    return {
      gi: snapGi,
      mode: modeFromGi(snapGi),
      terminal_status: null,
      primary_driver: 'GI from MIC_READINESS_SNAPSHOT fallback (KV gi:latest missing/stale)',
      source: 'readiness_snapshot',
      timestamp: new Date().toISOString(),
      kv: st,
    };
  }

  return {
    gi: null,
    mode: null,
    terminal_status: null,
    primary_driver: null,
    source: 'null',
    timestamp: null,
    kv: st,
  };
}
