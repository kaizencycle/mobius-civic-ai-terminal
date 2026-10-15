/**
 * lib/sustain/readSustainGate.ts — C-465 (ATLAS handoff, Part A).
 *
 * `sustain_eligible` on the integrity-status payload has meant two different
 * things (RC-1 in the handoff): "GI clears 0.75 right now" (instantaneous)
 * vs "the 5-consecutive-cycle sustain gate is satisfied" (a gate, tracked in
 * KV at MIC_SUSTAIN_STATE). ZEUS compares the first against the second and
 * disputes on every cycle where GI sits between 0.75 and 0.95 without a
 * 5-cycle streak — that is a category error, not an integrity event.
 *
 * This module reads the one real tracker (lib/mic/sustainTracker.ts,
 * KV-backed) and reports the GATE honestly — `null`, never `false`, when the
 * tracker is unreadable (fail-closed means "unknown," not "no").
 *
 * Deliberately placed outside lib/mic/ and lib/integrity/: both are Tier-3
 * ("operator-only") paths per .github/scope-guard/protected-paths.txt, and
 * this module only ever *reads* lib/mic/sustainTracker.ts's public exports —
 * it does not modify anything under either protected directory.
 */

import { loadSustainState, SUSTAIN_REQUIRED_CYCLES, type MicSustainStateV1 } from '@/lib/mic/sustainTracker';

export interface SustainGateReading {
  /** Null means the tracker could not be read — unknown, not "no". */
  sustain_gate_satisfied: boolean | null;
  fountain_sustain_satisfied: boolean | null;
  consecutive_eligible_cycles: number | null;
  consecutive_gi95_cycles: number | null;
  required_cycles: number;
}

function safeConsecutive(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** Pure — no I/O. Exported directly for contract tests. */
export function computeSustainGate(
  state: MicSustainStateV1 | null,
  requiredCycles: number = SUSTAIN_REQUIRED_CYCLES,
): SustainGateReading {
  if (!state) {
    return {
      sustain_gate_satisfied: null,
      fountain_sustain_satisfied: null,
      consecutive_eligible_cycles: null,
      consecutive_gi95_cycles: null,
      required_cycles: requiredCycles,
    };
  }
  const consecutiveEligible = safeConsecutive(state.consecutiveEligibleCycles);
  const consecutiveGi95 = safeConsecutive(state.consecutiveGi95Cycles);
  return {
    sustain_gate_satisfied: consecutiveEligible >= requiredCycles,
    fountain_sustain_satisfied: consecutiveGi95 >= requiredCycles,
    consecutive_eligible_cycles: consecutiveEligible,
    consecutive_gi95_cycles: consecutiveGi95,
    required_cycles: requiredCycles,
  };
}

/**
 * Read-through sustain gate. This is the single shared reader A3 requires —
 * every consumer that needs to know "is the sustain gate satisfied" should
 * call this, rather than re-deriving it, so two endpoints can never honestly
 * disagree about the same underlying KV state.
 */
export async function readSustainGate(): Promise<SustainGateReading> {
  try {
    const state = await loadSustainState();
    return computeSustainGate(state);
  } catch {
    return computeSustainGate(null);
  }
}
