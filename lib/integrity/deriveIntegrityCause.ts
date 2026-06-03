/**
 * C-331 — Interpretation layer (Observability → Interpretation).
 *
 * The terminal shows GI + mode everywhere, but WHY a given GI is degraded is left
 * for the operator to reconstruct by hand (Pulse says "7 lanes degraded", Vault
 * says "ledger 400", Tripwire says "1 anomaly" — the human joins them). This is a
 * PURE derivation over the canonical lane model (lib/terminal/snapshotLanes.ts):
 * it adds zero new data collection, reads what the snapshot already carries, and
 * emits a single ranked verdict { primary_cause, impact, recovery } to render
 * directly under the GI bar.
 *
 * Deterministic and side-effect free → testable outside React, safe to call on
 * any render path. It does NOT invent severity; it consumes the existing
 * SnapshotLaneSemanticState union.
 *
 * Uses relative imports deliberately so it can be tested outside the Next.js
 * bundler context (e.g. node --experimental-strip-types). Consumers inside Next.js
 * can still import it via '@/lib/integrity/deriveIntegrityCause'.
 */

import type {
  SnapshotLaneState,
  SnapshotLaneKey,
  SnapshotLaneSemanticState,
} from '../terminal/snapshotLanes.ts';
import { getGiMode, type GIMode } from '../gi/mode.ts';

export type IntegrityCauseSeverity = 'nominal' | 'watch' | 'warning' | 'critical';

export type IntegrityCause = {
  /** Overall posture derived from GI band + worst lane. */
  severity: IntegrityCauseSeverity;
  gi: number | null;
  mode: GIMode | null;
  /** Human-readable primary driver, e.g. "Ledger attestation unavailable". null when nominal. */
  primary_cause: string | null;
  /** The lane the primary cause came from, for deep-linking. */
  primary_lane: SnapshotLaneKey | null;
  /** What it affects, e.g. "7 of 15 lanes degraded". */
  impact: string;
  /** Suggested recovery direction (interpretation, not auto-remediation). null when nominal. */
  recovery: string | null;
  /** All non-healthy lanes, worst-first, for the expanded view. */
  contributing_lanes: Array<{
    key: SnapshotLaneKey;
    state: SnapshotLaneSemanticState;
    message: string;
  }>;
};

// Worst-first ordering. Determines which lane "wins" as the primary driver.
const STATE_RANK: Record<SnapshotLaneSemanticState, number> = {
  offline:    5,
  degraded:   4,
  stale:      3,
  empty:      2,
  promotable: 1,
  healthy:    0,
};

const NON_HEALTHY = new Set<SnapshotLaneSemanticState>([
  'offline',
  'degraded',
  'stale',
  'empty',
]);

/**
 * Per-lane interpretation: given the worst lane, name the cause + recovery in
 * operator language. Falls back to the lane's own message when no specific
 * mapping exists, so a new lane key never yields an empty cause.
 */
function interpretLane(lane: SnapshotLaneState): { cause: string; recovery: string } {
  const offline = lane.state === 'offline';
  switch (lane.key) {
    case 'vault':
      return {
        cause: offline ? 'Ledger attestation unavailable' : 'Vault attestation degraded',
        recovery: 'Verify Civic Protocol Core ledger reachability and substrate attestation env',
      };
    case 'integrity':
      return {
        cause: 'Integrity signal degraded',
        recovery: 'Inspect integrity lane source freshness',
      };
    case 'epicon':
      return {
        cause: 'EPICON verification stalled',
        recovery: 'Check pending verification quorum (ZEUS) and dispute queue',
      };
    case 'kvHealth':
      return {
        cause: 'KV store unavailable',
        recovery: 'Check Upstash Redis budget/availability',
      };
    case 'signals':
      return {
        cause: 'Signal lane stale',
        recovery: 'Confirm upstream signal sources are reporting',
      };
    case 'journal':
      return {
        cause: 'Journal lane empty/degraded',
        recovery: 'Verify substrate→KV→ECHO journal fallback chain',
      };
    case 'tripwire':
      return {
        cause: 'Active tripwire anomaly',
        recovery: 'Review Tripwire console for the firing detector',
      };
    case 'agents':
      return {
        cause: 'Agent lane degraded',
        recovery: 'Check sentinel/companion agent status',
      };
    case 'runtime':
      return {
        cause: 'GitHub runtime heartbeat unavailable',
        recovery: 'Check GitHub Actions heartbeat workflow and PAW liveness',
      };
    case 'echo':
      return {
        cause: 'ECHO ingest stale',
        recovery: 'Verify ECHO substrate→KV ingest pipeline is running',
      };
    case 'eve':
      return {
        cause: 'Cycle engine drift detected',
        recovery: 'Check EVE epoch vs transform alignment',
      };
    case 'mii':
      return {
        cause: 'MII feed empty or unavailable',
        recovery: 'Verify MII agent sweep and feed ingestion',
      };
    case 'sentiment':
      return {
        cause: 'Sentiment data stale',
        recovery: 'Confirm upstream sentiment sources are reporting on schedule',
      };
    case 'micReadiness':
      return {
        cause: 'MIC readiness check degraded',
        recovery: 'Review MIC readiness inputs: reserve balance, GI, and mint threshold',
      };
    default:
      return {
        cause: lane.message?.trim() || `${lane.key} lane ${lane.state}`,
        recovery: `Inspect ${lane.key} lane`,
      };
  }
}

function severityFrom(
  mode: GIMode | null,
  worst: SnapshotLaneSemanticState | null,
): IntegrityCauseSeverity {
  if (mode === 'red') return 'critical';
  if (worst === 'offline') return 'critical';
  if (mode === 'yellow' || worst === 'degraded') return 'warning';
  if (worst === 'stale' || worst === 'empty') return 'watch';
  return 'nominal';
}

/**
 * Derive the "why" behind the current GI from the canonical lane states.
 *
 * @param gi     current GI value, or null if unknown
 * @param lanes  normalized lane states (lib/terminal/snapshotLanes.ts)
 */
export function deriveIntegrityCause(
  gi: number | null,
  lanes: SnapshotLaneState[],
): IntegrityCause {
  const mode = gi === null ? null : getGiMode(gi);

  const contributing = lanes
    .filter((l) => NON_HEALTHY.has(l.state))
    .sort((a, b) => STATE_RANK[b.state] - STATE_RANK[a.state]);

  const total = lanes.length;
  const degradedCount = contributing.length;

  // Nominal: GI green (or unknown) and no non-healthy lanes.
  if (degradedCount === 0 && mode !== 'red' && mode !== 'yellow') {
    return {
      severity: 'nominal',
      gi,
      mode,
      primary_cause: null,
      primary_lane: null,
      impact: total > 0 ? `All ${total} lanes healthy` : 'No lane data',
      recovery: null,
      contributing_lanes: [],
    };
  }

  const worst = contributing[0] ?? null;
  const severity = severityFrom(mode, worst?.state ?? null);

  // GI band is degraded but every lane reads healthy → surface the gap honestly
  // rather than fabricating a cause. Consistent with operator-first truth-telling.
  if (!worst) {
    return {
      severity,
      gi,
      mode,
      primary_cause: `GI in ${mode} band with no degraded lane reporting`,
      primary_lane: null,
      impact: 'GI band and lane health disagree — investigate GI source',
      recovery: 'Check GI computation inputs; lane health may lag the GI calc',
      contributing_lanes: [],
    };
  }

  const { cause, recovery } = interpretLane(worst);

  return {
    severity,
    gi,
    mode,
    primary_cause: cause,
    primary_lane: worst.key,
    impact:
      degradedCount === 1
        ? `1 of ${total} lanes degraded (${worst.key})`
        : `${degradedCount} of ${total} lanes degraded`,
    recovery,
    contributing_lanes: contributing.map((l) => ({
      key: l.key,
      state: l.state,
      message: l.message,
    })),
  };
}
