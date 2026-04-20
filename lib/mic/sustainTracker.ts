/**
 * C-287 — consecutive GI ≥ threshold cycles for Fountain sustain gate (KV-backed).
 */

import { currentCycleId } from '@/lib/eve/cycle-engine';
import { kvGet, kvSet, KV_KEYS, KV_TTL_SECONDS } from '@/lib/kv/store';

export const SUSTAIN_GI_THRESHOLD = 0.95;
export const SUSTAIN_REQUIRED_CYCLES = 5;

import type { MicSustainStatus } from '@/lib/mic/types';

export interface MicSustainStateV1 {
  schema: 'MIC_SUSTAIN_STATE_V1';
  consecutiveEligibleCycles: number;
  lastEligibleCycle: string | null;
  lastCheckedCycle: string;
  status: MicSustainStatus;
  updatedAt: string;
}

function defaultState(cycle: string): MicSustainStateV1 {
  const now = new Date().toISOString();
  return {
    schema: 'MIC_SUSTAIN_STATE_V1',
    consecutiveEligibleCycles: 0,
    lastEligibleCycle: null,
    lastCheckedCycle: cycle,
    status: 'not_started',
    updatedAt: now,
  };
}

function deriveStatus(consecutive: number): MicSustainStatus {
  if (consecutive >= SUSTAIN_REQUIRED_CYCLES) return 'satisfied';
  if (consecutive > 0) return 'in_progress';
  return 'not_started';
}

/**
 * Advance sustain counter once per operator cycle when GI is known.
 * Idempotent: same `currentCycle` returns stored state without double-counting.
 */
export async function updateSustainTrackingFromGi(
  currentGi: number | null,
  currentCycle?: string,
): Promise<MicSustainStateV1 | null> {
  const cycle = (currentCycle ?? currentCycleId()).trim();
  if (!cycle) return null;

  if (currentGi === null || !Number.isFinite(currentGi)) {
    return null;
  }

  const gi = Math.max(0, Math.min(1, currentGi));
  const prev = (await kvGet<MicSustainStateV1>(KV_KEYS.MIC_SUSTAIN_STATE)) ?? defaultState(cycle);

  if (prev.lastCheckedCycle === cycle) {
    return prev;
  }

  const eligible = gi >= SUSTAIN_GI_THRESHOLD;
  const consecutive = eligible ? prev.consecutiveEligibleCycles + 1 : 0;
  const status = deriveStatus(consecutive);

  const next: MicSustainStateV1 = {
    schema: 'MIC_SUSTAIN_STATE_V1',
    consecutiveEligibleCycles: consecutive,
    lastEligibleCycle: eligible ? cycle : prev.lastEligibleCycle,
    lastCheckedCycle: cycle,
    status,
    updatedAt: new Date().toISOString(),
  };

  await kvSet(KV_KEYS.MIC_SUSTAIN_STATE, next, KV_TTL_SECONDS.MIC_SUSTAIN_STATE);
  return next;
}

export async function loadSustainState(): Promise<MicSustainStateV1 | null> {
  return kvGet<MicSustainStateV1>(KV_KEYS.MIC_SUSTAIN_STATE);
}
