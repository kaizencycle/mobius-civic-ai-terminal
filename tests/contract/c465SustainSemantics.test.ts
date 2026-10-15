// C-465 — sustain semantics disambiguation (Part A). Run: tsx tests/contract/c465SustainSemantics.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeSustainGate } from '@/lib/sustain/readSustainGate';
import { buildDecisionStateOverlay, applyDecisionStateOverlay } from '@/lib/sustain/decisionStateOverlay';
import { deriveOperationalDecisionState } from '@/lib/integrity/operationalState';
import { SUSTAIN_GI_THRESHOLD, SUSTAIN_REQUIRED_CYCLES, type MicSustainStateV1 } from '@/lib/mic/sustainTracker';

function trackerState(overrides: Partial<MicSustainStateV1> = {}): MicSustainStateV1 {
  return {
    schema: 'MIC_SUSTAIN_STATE_V1',
    consecutiveEligibleCycles: 0,
    consecutiveGi95Cycles: 0,
    lastEligibleCycle: null,
    lastCheckedCycle: 'C-465',
    status: 'not_started',
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('C-465 T7: instant threshold vs gate are reported independently', () => {
  it('GI 0.80 with 2 consecutive eligible cycles: gi_meets_sustain_threshold=true, sustain_gate_satisfied=false, legacy sustain_eligible unchanged=true', () => {
    assert.equal(0.8 >= SUSTAIN_GI_THRESHOLD, true, 'sanity: 0.80 clears the 0.75 instant threshold');

    const gate = computeSustainGate(trackerState({ consecutiveEligibleCycles: 2 }), SUSTAIN_REQUIRED_CYCLES);
    assert.equal(gate.sustain_gate_satisfied, false, '2 < 5 required consecutive cycles');

    const decisionState = deriveOperationalDecisionState({
      gi: 0.8,
      tripwire_active: false,
      kv_continuity_ok: true,
      degraded_agent_count: 0,
      gi_degraded: false,
    });
    // The legacy field must be byte-for-byte unchanged behavior (A2): still the instant threshold.
    assert.equal(decisionState.sustain_eligible, true);

    const overlay = buildDecisionStateOverlay({
      gi: 0.8,
      tripwireSource: 'kv',
      tripwireLastUpdated: new Date().toISOString(),
      sustainGate: gate,
    });
    assert.equal(overlay.gi_meets_sustain_threshold, true);
    assert.equal(overlay.sustain_gate_satisfied, false);
    assert.equal(overlay.sustain_eligible_semantics, 'instant_gi_threshold');

    const applied = applyDecisionStateOverlay(decisionState, overlay);
    // The category error C-465 exists to fix: these two fields must never be
    // compared to each other as if they answered the same question, and must
    // both be present, visibly distinct, on the same payload.
    assert.equal(applied.sustain_eligible, true);
    assert.equal(applied.sustain_gate_satisfied, false);
  });

  it('5 consecutive eligible cycles satisfies the gate', () => {
    const gate = computeSustainGate(trackerState({ consecutiveEligibleCycles: 5 }), SUSTAIN_REQUIRED_CYCLES);
    assert.equal(gate.sustain_gate_satisfied, true);
  });
});

describe('C-465 T8: unreadable tracker reports null, never false', () => {
  it('computeSustainGate(null) -> null, not false', () => {
    const gate = computeSustainGate(null);
    assert.equal(gate.sustain_gate_satisfied, null);
    assert.equal(gate.fountain_sustain_satisfied, null);
    assert.notEqual(gate.sustain_gate_satisfied, false, 'fail-closed means unknown, not "no" (AGENTS.md: do not invent runtime values)');
  });
});

describe('C-465 T9: integrity-status and vault/status share one reader, so they cannot honestly disagree', () => {
  it('the same tracker state produces identical sustain_gate_satisfied through the one shared computeSustainGate()', () => {
    const state = trackerState({ consecutiveEligibleCycles: 7 });

    // /api/integrity-status's path (via lib/sustain/decisionStateOverlay.ts)
    const integrityGate = computeSustainGate(state, SUSTAIN_REQUIRED_CYCLES);
    const overlay = buildDecisionStateOverlay({
      gi: 0.95,
      tripwireSource: 'kv',
      tripwireLastUpdated: new Date().toISOString(),
      sustainGate: integrityGate,
    });

    // /api/vault/status's path: `sustainGate.sustain_gate_satisfied ?? seal_lane.sustain_met`
    // (app/api/vault/status/route.ts) — reusing the exact same computeSustainGate() call.
    const vaultGate = computeSustainGate(state, SUSTAIN_REQUIRED_CYCLES);
    const legacySustainMet = false; // seal_lane.sustain_met is a hardcoded literal (lib/vault/lane-status.ts) — see PR notes
    const vaultSustainCyclesMet = vaultGate.sustain_gate_satisfied ?? legacySustainMet;

    assert.equal(overlay.sustain_gate_satisfied, vaultSustainCyclesMet);
    assert.equal(overlay.sustain_gate_satisfied, true);
  });

  it('when the tracker is unreadable, vault/status honestly falls back to its prior (false) behavior rather than asserting a gate it cannot confirm', () => {
    const gate = computeSustainGate(null);
    const legacySustainMet = false;
    const vaultSustainCyclesMet = gate.sustain_gate_satisfied ?? legacySustainMet;
    assert.equal(vaultSustainCyclesMet, false);
    // But the new, honestly-nullable field is still exposed distinctly:
    assert.equal(gate.sustain_gate_satisfied, null);
  });
});
