// C-384 PR-6: server write circuit breaker (C-261 + protocol 0.85 + epoch drop).
// Run: tsx tests/contract/serverWriteCircuitBreaker.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  GI_PROTOCOL_EMERGENCY_LOCK,
  detectEpochGiDrop,
  evaluateServerWriteFromInputs,
} from '../../lib/gi/serverWriteCircuitBreaker.ts';

describe('server write circuit breaker (C-384 PR-6)', () => {
  it('protocol lock blocks writes when GI is below 0.85 even in guarded band', () => {
    const evaluation = evaluateServerWriteFromInputs(0.71, 0.72, 'stable');
    assert.equal(evaluation.allowed, false);
    assert.equal(evaluation.belowProtocolLock, true);
    assert.ok(evaluation.gi < GI_PROTOCOL_EMERGENCY_LOCK);
  });

  it('allows writes when GI is at or above protocol lock and C-261 permits', () => {
    const evaluation = evaluateServerWriteFromInputs(0.86, 0.86, 'stable');
    assert.equal(evaluation.allowed, true);
    assert.equal(evaluation.belowProtocolLock, false);
  });

  it('detectEpochGiDrop trips on >5% relative drop', () => {
    assert.equal(detectEpochGiDrop(0.71, 0.76), true);
    assert.equal(detectEpochGiDrop(0.74, 0.76), false);
  });

  it('epoch drop blocks writes even when GI is above protocol lock', () => {
    const evaluation = evaluateServerWriteFromInputs(0.9, 0.96, 'stable');
    assert.equal(evaluation.epochDropTriggered, true);
    assert.equal(evaluation.allowed, false);
  });

  it('C-261 containment blocks writes below containment threshold', () => {
    const evaluation = evaluateServerWriteFromInputs(0.65, null, 'stable');
    assert.equal(evaluation.c261.stage, 'containment');
    assert.equal(evaluation.allowed, false);
  });
});
