/**
 * C-384 PR-6 — server-side write circuit breaker (C-261 stages + protocol 0.85 / epoch drop).
 */

import { NextResponse } from 'next/server';

import { C261_COVENANT } from '@/lib/constants/covenants';
import { computeIntegrityPayload, type IntegrityPayload } from '@/lib/integrity/buildStatus';
import { getLatestIntegritySignal } from '@/lib/integrity/signal-store';
import {
  evaluateCircuitBreaker,
  type BreakerTripwireState,
  type CircuitBreakerDecision,
} from '@/lib/integrity-check';
import { loadGiTrend, loadTripwireState, type GITrendEntry } from '@/lib/kv/store';
import { getTripwireState } from '@/lib/tripwire/store';

/** Vault / Fountain emergency lock line (protocol); distinct from C-261 staged thresholds. */
export const GI_PROTOCOL_EMERGENCY_LOCK = C261_COVENANT.IDEAL_SIGNAL;

/** Relative GI drop vs previous trend point that trips the breaker (handoff: >5% / epoch). */
export const GI_EPOCH_DROP_FRACTION = 0.05;

/** Matches client `useTerminalData` and jade integrity-signal covenant. */
export const GEO_SEMANTIC_DRIFT_TRIP_THRESHOLD = 0.7;

/** Aligns with fresh `gi:latest` window in `computeIntegrityPayload`. */
export const GI_WRITE_MAX_AGE_MS = 15 * 60 * 1000;

export type ServerWriteBreakerEvaluation = {
  gi: number;
  c261: CircuitBreakerDecision;
  belowProtocolLock: boolean;
  epochDropTriggered: boolean;
  giProvenanceBlocked: boolean;
  allowed: boolean;
  stage: CircuitBreakerDecision['stage'];
  message: string;
};

function mapRuntimeTripwireState(tw: ReturnType<typeof getTripwireState>): BreakerTripwireState {
  if (!tw.active) return 'stable';
  if (
    tw.level === 'high' ||
    tw.level === 'triggered' ||
    tw.level === 'suspended' ||
    tw.level === 'elevated'
  ) {
    return 'degraded';
  }
  if (tw.level === 'watch' || tw.level === 'medium') return 'watch';
  return 'stable';
}

/** Prefer in-process tripwire when set; otherwise persisted KV (with decay) for serverless cold starts. */
export async function resolveBreakerTripwireState(): Promise<BreakerTripwireState> {
  const local = mapRuntimeTripwireState(getTripwireState());
  if (local !== 'stable') return local;

  const persisted = await loadTripwireState();
  if (persisted?.elevated && persisted.tripwireCount > 0) return 'degraded';
  return 'stable';
}

export function isGiSnapshotTrustedForWrites(
  payload: Pick<IntegrityPayload, 'source' | 'timestamp'>,
): boolean {
  if (payload.source === 'mock' || payload.source === 'cached') return false;
  if (payload.source !== 'kv' && payload.source !== 'live') return false;
  const age = Date.now() - new Date(payload.timestamp).getTime();
  return Number.isFinite(age) && age >= 0 && age < GI_WRITE_MAX_AGE_MS;
}

export function detectSemanticDriftFromSignal(): boolean {
  const driftScore = getLatestIntegritySignal()?.layers?.geo_layer?.semantic_drift;
  if (typeof driftScore !== 'number') return false;
  return driftScore >= GEO_SEMANTIC_DRIFT_TRIP_THRESHOLD;
}

export function detectEpochGiDrop(currentGi: number, previousGi: number | null): boolean {
  if (previousGi === null || !Number.isFinite(previousGi) || previousGi <= 0) return false;
  if (!Number.isFinite(currentGi)) return false;
  const drop = (previousGi - currentGi) / previousGi;
  return drop > GI_EPOCH_DROP_FRACTION;
}

/**
 * Newest-first `gi:trend` head vs the first prior point with a different GI (skips duplicate heartbeats).
 */
export function resolveTrendEpochGiPair(
  trend: GITrendEntry[],
): { current: number; previous: number } | null {
  if (trend.length < 2) return null;
  const newest = trend[0]?.gi;
  if (typeof newest !== 'number' || !Number.isFinite(newest)) return null;

  for (let i = 1; i < trend.length; i++) {
    const prior = trend[i]?.gi;
    if (typeof prior !== 'number' || !Number.isFinite(prior)) continue;
    if (prior === newest) continue;
    return { current: newest, previous: prior };
  }
  return null;
}

/**
 * Epoch drop from trend vs prior epoch when live GI still reflects the drop, or live vs trend head
 * when the snapshot leads KV. Stale trend heads do not block writes after live GI recovers.
 */
export function detectEpochGiDropFromTrend(trend: GITrendEntry[], liveGi: number): boolean {
  const pair = resolveTrendEpochGiPair(trend);
  if (pair) {
    const liveStillDroppedVsPrior = detectEpochGiDrop(liveGi, pair.previous);
    if (liveStillDroppedVsPrior && detectEpochGiDrop(pair.current, pair.previous)) return true;
  }

  const headGi = trend[0]?.gi;
  if (typeof headGi === 'number' && Number.isFinite(liveGi) && detectEpochGiDrop(liveGi, headGi)) {
    return true;
  }
  return false;
}

export type ServerWriteBreakerInputOptions = {
  semanticDriftDetected?: boolean;
  epochDropTriggered?: boolean;
  giProvenanceBlocked?: boolean;
};

export function evaluateServerWriteFromInputs(
  gi: number,
  tripwireState: BreakerTripwireState,
  options: ServerWriteBreakerInputOptions = {},
): ServerWriteBreakerEvaluation {
  const semanticDriftDetected = options.semanticDriftDetected ?? false;
  const epochDropTriggered = options.epochDropTriggered ?? false;
  const giProvenanceBlocked = options.giProvenanceBlocked ?? false;

  const c261 = evaluateCircuitBreaker({
    giScore: gi,
    tripwireState,
    semanticDriftDetected,
  });
  const belowProtocolLock = gi < GI_PROTOCOL_EMERGENCY_LOCK;
  const allowed =
    c261.writeAllowed && !belowProtocolLock && !epochDropTriggered && !giProvenanceBlocked;

  let message = c261.message;
  if (!allowed) {
    if (giProvenanceBlocked) {
      message =
        'GI snapshot is stale, cached, or synthetic — write lanes paused until a fresh trusted GI reading is available.';
    } else if (!c261.writeAllowed) message = c261.message;
    else if (belowProtocolLock) {
      message = `Protocol emergency lock: GI ${gi.toFixed(3)} is below ${GI_PROTOCOL_EMERGENCY_LOCK}. Write lanes paused.`;
    } else if (epochDropTriggered) {
      message = `GI epoch drop exceeds ${(GI_EPOCH_DROP_FRACTION * 100).toFixed(0)}% — write lanes paused pending review.`;
    }
  }

  return {
    gi,
    c261,
    belowProtocolLock,
    epochDropTriggered,
    giProvenanceBlocked,
    allowed,
    stage: c261.stage,
    message,
  };
}

export async function evaluateServerWriteCircuitBreaker(): Promise<ServerWriteBreakerEvaluation> {
  const payload = await computeIntegrityPayload();
  const gi = payload.global_integrity;
  const trend = await loadGiTrend();
  const semanticDriftDetected = detectSemanticDriftFromSignal();
  const epochDropTriggered = detectEpochGiDropFromTrend(trend, gi);
  const giProvenanceBlocked = !isGiSnapshotTrustedForWrites(payload);
  const tripwireState = await resolveBreakerTripwireState();
  return evaluateServerWriteFromInputs(gi, tripwireState, {
    semanticDriftDetected,
    epochDropTriggered,
    giProvenanceBlocked,
  });
}

export async function getServerWriteCircuitBreakerError(): Promise<NextResponse | null> {
  const evaluation = await evaluateServerWriteCircuitBreaker();
  if (evaluation.allowed) return null;

  return NextResponse.json(
    {
      ok: false,
      error: 'circuit_breaker_open',
      stage: evaluation.stage,
      gi: evaluation.gi,
      below_protocol_lock: evaluation.belowProtocolLock,
      epoch_drop: evaluation.epochDropTriggered,
      gi_untrusted: evaluation.giProvenanceBlocked,
      message: evaluation.message,
    },
    { status: 503 },
  );
}
