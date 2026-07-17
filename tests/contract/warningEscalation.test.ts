/**
 * C-375 — Warning fingerprint escalation (canon-drift-tripwire pattern).
 * Run: tsx tests/contract/warningEscalation.test.ts
 */

import assert from 'node:assert/strict';
import { nextWarningEscalationState } from '../../lib/log/warningEscalation';

const THRESHOLD = 6;
const FINGERPRINT = 'ledger-zeus-journal-non-json';

let prev: { count: number; escalated?: boolean } | null = null;
let escalatedAt: number | null = null;

for (let i = 1; i <= THRESHOLD; i++) {
  const state = nextWarningEscalationState(prev, THRESHOLD);
  prev = { count: state.count, escalated: prev?.escalated || state.escalated };
  if (state.escalated) {
    escalatedAt = i;
  }
}

assert.equal(escalatedAt, THRESHOLD, `[FAIL] expected escalation at ${THRESHOLD}, got ${escalatedAt}`);
assert.equal(prev?.escalated, true, '[FAIL] escalated flag should be set');

// After escalation, further failures must not re-escalate.
const after = nextWarningEscalationState(prev, THRESHOLD);
assert.equal(after.escalated, false, '[FAIL] must not re-escalate once fingerprint is escalated');
assert.equal(after.count, THRESHOLD + 1, '[FAIL] count should keep incrementing');

// Success clears the fingerprint in production; simulate reset.
prev = null;
const fresh = nextWarningEscalationState(prev, THRESHOLD);
assert.equal(fresh.count, 1, '[FAIL] cleared fingerprint should restart at 1');
assert.equal(fresh.escalated, false, '[FAIL] first failure must not escalate');

console.log(`✓ warning escalation fires once at N=${THRESHOLD} for fingerprint "${FINGERPRINT}"`);
