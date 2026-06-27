/**
 * Contract tests: IPI Escalation Matrix
 * EPICON C-355 — Integrity Difficulty Adjustment
 *
 * Six tests covering all five escalation tiers plus Peak Integrity Fallacy.
 */

import assert from 'node:assert/strict'
import {
  computeIPI,
  detectPeakFallacy,
  type IPIComponents,
} from '../../lib/integrity/ipi'

// ─── helpers ────────────────────────────────────────────────────────────────

/** Build uniform components that produce a target IPI score (approx). */
function uniformComponents(targetScore: number): IPIComponents {
  // IPI = a × b × c × d. For uniform components: each = score^(1/4)
  const v = Math.pow(targetScore, 0.25)
  return {
    anomaly_density: v,
    dissent: v,
    volatility: v,
    witness_lag: v,
  }
}

// ─── tests ──────────────────────────────────────────────────────────────────

// Test 1: Stable tier
const stable = computeIPI(uniformComponents(0.20))
assert.equal(stable.state, 'stable', `[FAIL T1] state: ${stable.state}`)
assert.equal(stable.triggered_sentinels.length, 0, `[FAIL T1] sentinels: ${stable.triggered_sentinels}`)
assert.equal(stable.fountain_status, 'confirmed', `[FAIL T1] fountain: ${stable.fountain_status}`)
assert.equal(stable.human_required, false, `[FAIL T1] human_required: ${stable.human_required}`)
console.log('✓ T1 — Stable tier: no sentinels, fountain confirmed')

// Test 2: Elevated tier
const elevated = computeIPI(uniformComponents(0.45))
assert.equal(elevated.state, 'elevated', `[FAIL T2] state: ${elevated.state}`)
assert.ok(elevated.triggered_sentinels.includes('HERMES'), '[FAIL T2] HERMES missing')
assert.ok(elevated.triggered_sentinels.includes('ECHO'), '[FAIL T2] ECHO missing')
assert.ok(!elevated.triggered_sentinels.includes('AUREA'), '[FAIL T2] AUREA should not fire at elevated')
assert.ok(!elevated.triggered_sentinels.includes('ZEUS'), '[FAIL T2] ZEUS should not fire at elevated')
console.log('✓ T2 — Elevated tier: HERMES + ECHO only')

// Test 3: Critical drift tier
const critical = computeIPI(uniformComponents(0.70))
assert.equal(critical.state, 'critical_drift', `[FAIL T3] state: ${critical.state}`)
assert.ok(critical.triggered_sentinels.includes('AUREA'), '[FAIL T3] AUREA missing')
assert.ok(critical.triggered_sentinels.includes('JADE'), '[FAIL T3] JADE missing')
assert.ok(!critical.triggered_sentinels.includes('ZEUS'), '[FAIL T3] ZEUS should not fire at critical_drift')
assert.ok(!critical.triggered_sentinels.includes('ATLAS'), '[FAIL T3] ATLAS should not fire below 0.80 (Quorum Fatigue Law)')
console.log('✓ T3 — Critical drift: AUREA + JADE added, ZEUS absent')

// Test 4: Constitutional instability tier
const instability = computeIPI(uniformComponents(0.85))
assert.equal(instability.state, 'constitutional_instability', `[FAIL T4] state: ${instability.state}`)
assert.ok(instability.triggered_sentinels.includes('ATLAS'), '[FAIL T4] ATLAS missing')
assert.ok(instability.triggered_sentinels.includes('EVE'), '[FAIL T4] EVE missing')
assert.ok(!instability.triggered_sentinels.includes('ZEUS'), '[FAIL T4] ZEUS should not appear until integrity_crisis')
assert.equal(instability.fountain_status, 'conditional', `[FAIL T4] fountain: ${instability.fountain_status}`)
console.log('✓ T4 — Constitutional instability: ATLAS + EVE, fountain conditional')

// Test 5: Integrity crisis tier
const crisis = computeIPI(uniformComponents(0.97))
assert.equal(crisis.state, 'integrity_crisis', `[FAIL T5] state: ${crisis.state}`)
assert.ok(crisis.triggered_sentinels.includes('ZEUS'), '[FAIL T5] ZEUS missing at crisis tier')
assert.equal(crisis.fountain_status, 'suspended', `[FAIL T5] fountain: ${crisis.fountain_status}`)
assert.equal(crisis.human_required, true, '[FAIL T5] human_required must be true at crisis tier')
const allSentinels = ['HERMES', 'ECHO', 'AUREA', 'JADE', 'ATLAS', 'EVE', 'ZEUS']
allSentinels.forEach(s => {
  assert.ok(crisis.triggered_sentinels.includes(s), `[FAIL T5] ${s} missing from crisis roster`)
})
console.log('✓ T5 — Integrity crisis: all sentinels, fountain suspended, human required')

// Test 6: Peak Integrity Fallacy detection
const normalSequence = [0.91, 0.92, 0.93, 0.93]
const fallacySequence = [0.96, 0.98, 1.00, 0.79]

assert.equal(detectPeakFallacy(normalSequence), false, '[FAIL T6] normal sequence should not trigger peak fallacy')
assert.equal(detectPeakFallacy(fallacySequence), true, '[FAIL T6] fallacy sequence should trigger peak fallacy detection')
console.log('✓ T6 — Peak Integrity Fallacy: detected on rapid post-peak collapse')

console.log('\n✓ All 6 IPI escalation contract tests passed')
