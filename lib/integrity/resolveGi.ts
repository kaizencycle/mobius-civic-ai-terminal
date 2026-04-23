/**
 * C-286 / C-287 — single GI resolution for MIC readiness, snapshot-lite, and ops surfaces.
 */

import type { GIMode } from '@/lib/gi/mode';
import { resolveGiChain, type GISourceDisplay } from '@/lib/gi/resolveGiChain';
import type { GIState } from '@/lib/kv/store';

export type GiResolutionSource =
  | 'kv'
  | 'kv_carry_forward'
  | 'live_compute'
  | 'readiness_snapshot'
  | 'oaa_verified'
  | 'null';

export type ResolvedGi = {
  gi: number | null;
  mode: GIMode | string | null;
  terminal_status: string | null;
  primary_driver: string | null;
  source: GiResolutionSource;
  timestamp: string | null;
  /** C-287 operator-facing tier */
  gi_provenance: GISourceDisplay;
  verified: boolean;
  degraded: boolean;
  age_seconds: number | null;
  /** When `source === 'kv'`, the underlying row (for staleness / carry-forward flags). */
  kv?: GIState | null;
};

function mapProvenanceToLegacy(p: GISourceDisplay): GiResolutionSource {
  switch (p) {
    case 'kv-live':
      return 'kv';
    case 'live-compute':
      return 'live_compute';
    case 'kv-carry':
      return 'kv_carry_forward';
    case 'oaa-verified':
      return 'oaa_verified';
    case 'readiness-fallback':
      return 'readiness_snapshot';
    default:
      return 'null';
  }
}

/**
 * Resolve GI via C-287 chain (KV → live → carry → OAA → readiness → unknown). No estimation.
 */
export async function resolveGiForTerminal(opts?: {
  micReadinessSnapshotRaw?: string | null;
  preloadedGi?: { primary: GIState | null; carry: GIState | null };
}): Promise<ResolvedGi> {
  const chain = await resolveGiChain({
    micReadinessSnapshotRaw: opts?.micReadinessSnapshotRaw,
    preloadedGi: opts?.preloadedGi,
  });
  return {
    gi: chain.gi,
    mode: chain.mode,
    terminal_status: chain.terminal_status,
    primary_driver: chain.primary_driver,
    source: mapProvenanceToLegacy(chain.source),
    timestamp: chain.timestamp,
    gi_provenance: chain.source,
    verified: chain.verified,
    degraded: chain.degraded,
    age_seconds: chain.age_seconds,
    kv: chain.kv,
  };
}
