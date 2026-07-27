/**
 * C-384 PR-6 — server-side write circuit breaker (C-261 stages + protocol 0.85 / epoch drop).
 */

import { NextResponse } from 'next/server';

import { C261_COVENANT } from '@/lib/constants/covenants';
import { getLiveIntegritySnapshot } from '@/lib/integrity/buildStatus';
import {
  evaluateCircuitBreaker,
  type BreakerTripwireState,
  type CircuitBreakerDecision,
} from '@/lib/integrity-check';
import { loadGiTrend } from '@/lib/kv/store';
import { getTripwireState } from '@/lib/tripwire/store';

/** Vault / Fountain emergency lock line (protocol); distinct from C-261 staged thresholds. */
export const GI_PROTOCOL_EMERGENCY_LOCK = C261_COVENANT.IDEAL_SIGNAL;

/** Relative GI drop vs previous trend point that trips the breaker (handoff: >5% / epoch). */
export const GI_EPOCH_DROP_FRACTION = 0.05;

export type ServerWriteBreakerEvaluation = {
  gi: number;
  c261: CircuitBreakerDecision;
  belowProtocolLock: boolean;
  epochDropTriggered: boolean;
  allowed: boolean;
  stage: CircuitBreakerDecision['stage'];
  message: string;
};

function mapTripwireState(): BreakerTripwireState {
  const tw = getTripwireState();
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

export function detectEpochGiDrop(currentGi: number, previousGi: number | null): boolean {
  if (previousGi === null || !Number.isFinite(previousGi) || previousGi <= 0) return false;
  if (!Number.isFinite(currentGi)) return false;
  const drop = (previousGi - currentGi) / previousGi;
  return drop > GI_EPOCH_DROP_FRACTION;
}

export function evaluateServerWriteFromInputs(
  gi: number,
  previousGi: number | null,
  tripwireState: BreakerTripwireState,
): ServerWriteBreakerEvaluation {
  const c261 = evaluateCircuitBreaker({
    giScore: gi,
    tripwireState,
    semanticDriftDetected: false,
  });
  const belowProtocolLock = gi < GI_PROTOCOL_EMERGENCY_LOCK;
  const epochDropTriggered = detectEpochGiDrop(gi, previousGi);
  const allowed = c261.writeAllowed && !belowProtocolLock && !epochDropTriggered;

  let message = c261.message;
  if (!allowed) {
    if (!c261.writeAllowed) message = c261.message;
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
    allowed,
    stage: c261.stage,
    message,
  };
}

export async function evaluateServerWriteCircuitBreaker(): Promise<ServerWriteBreakerEvaluation> {
  const { global_integrity: gi } = await getLiveIntegritySnapshot();
  const trend = await loadGiTrend();
  const previousGi = trend.length >= 2 && typeof trend[1]?.gi === 'number' ? trend[1].gi : null;
  return evaluateServerWriteFromInputs(gi, previousGi, mapTripwireState());
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
      message: evaluation.message,
    },
    { status: 503 },
  );
}
