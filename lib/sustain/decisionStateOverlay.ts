/**
 * lib/sustain/decisionStateOverlay.ts — C-465 (ATLAS handoff, Part A).
 *
 * Adds the disambiguated sustain fields (A1) and tripwire provenance (B5) to
 * an already-built `OperationalDecisionState`, without editing
 * lib/integrity/operationalState.ts or lib/integrity/buildIntegrityEnrichment.ts
 * — both are Tier-3 ("operator-only") per .github/scope-guard/protected-paths.txt.
 * This overlay is applied at the route layer instead; it only ever reads the
 * existing `OperationalDecisionState` shape (type-only import) and returns a
 * patched copy. Pure and synchronous — no I/O, directly unit-testable.
 */

import type { OperationalDecisionState } from '@/lib/integrity/operationalState';
import { SUSTAIN_GI_THRESHOLD } from '@/lib/mic/sustainTracker';
import type { TripwireSource } from '@/lib/tripwire/store';
import type { SustainGateReading } from './readSustainGate';

export type SustainEligibleSemantics = 'instant_gi_threshold';

export type DecisionStateOverlay = {
  /** GI ≥ SUSTAIN_GI_THRESHOLD (0.75) at this instant. Counts toward the streak. Not a gate. */
  gi_meets_sustain_threshold: boolean;
  /** Pins what the legacy `sustain_eligible` field has always meant — see sustain_gate_satisfied for the gate. */
  sustain_eligible_semantics: SustainEligibleSemantics;
  /** Sustain gate: consecutiveEligibleCycles >= SUSTAIN_REQUIRED_CYCLES (KV MIC_SUSTAIN_STATE). null if unknown. */
  sustain_gate_satisfied: boolean | null;
  /** Fountain gate: consecutiveGi95Cycles >= SUSTAIN_REQUIRED_CYCLES. null if unknown. */
  fountain_sustain_satisfied: boolean | null;
  tripwire_source: TripwireSource;
  tripwire_last_updated: string;
};

export function buildDecisionStateOverlay(args: {
  gi: number;
  tripwireSource: TripwireSource;
  tripwireLastUpdated: string;
  sustainGate: SustainGateReading;
}): DecisionStateOverlay {
  return {
    gi_meets_sustain_threshold: args.gi >= SUSTAIN_GI_THRESHOLD,
    sustain_eligible_semantics: 'instant_gi_threshold',
    sustain_gate_satisfied: args.sustainGate.sustain_gate_satisfied,
    fountain_sustain_satisfied: args.sustainGate.fountain_sustain_satisfied,
    tripwire_source: args.tripwireSource,
    tripwire_last_updated: args.tripwireLastUpdated,
  };
}

/**
 * Applies the overlay to a decision_state. When the tripwire reading is
 * 'baseline' (neither this instance's memory nor KV has ever actually
 * evaluated a tripwire), forces `tripwire_state` to 'unknown' rather than
 * leaving the underlying derivation's default "clear" stand — a cold
 * instance must never present an unevaluated baseline as an affirmative
 * clear (C-465 T4).
 */
export function applyDecisionStateOverlay(
  decisionState: OperationalDecisionState,
  overlay: DecisionStateOverlay,
): OperationalDecisionState & DecisionStateOverlay {
  const forceUnknown = overlay.tripwire_source === 'baseline';
  const tripwire_state = forceUnknown ? ('unknown' as const) : decisionState.tripwire_state;
  const decision_summary = forceUnknown
    ? `${decisionState.decision_summary}; tripwire status unknown (no runtime or persisted record)`
    : decisionState.decision_summary;

  return {
    ...decisionState,
    ...overlay,
    tripwire_state,
    decision_summary,
  };
}
