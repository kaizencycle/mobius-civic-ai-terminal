// C-384 PR-6: server write circuit breaker (C-261 + protocol 0.85 + epoch drop).
// Run: tsx tests/contract/serverWriteCircuitBreaker.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  GI_PROTOCOL_EMERGENCY_LOCK,
  detectEpochGiDrop,
  detectEpochGiDropFromTrend,
  detectSemanticDriftFromSignal,
  evaluateServerWriteFromInputs,
  resolveTrendEpochGiPair,
} from '../../lib/gi/serverWriteCircuitBreaker.ts';
import {
  getLatestIntegritySignal,
  setLatestIntegritySignal,
} from '../../lib/integrity/signal-store.ts';
import type { MobiusCivicIntegritySignal } from '../../lib/integrity-signal.ts';

function minimalSignal(semanticDrift: number): MobiusCivicIntegritySignal {
  return {
    signal_id: 'test-signal',
    timestamp: new Date().toISOString(),
    claim: { text: 'test', source_node: 'test' },
    integrity_score: 0.9,
    layers: {
      geo_layer: {
        ai_consensus: 'aligned',
        citation_count: 1,
        semantic_drift: semanticDrift,
      },
      seo_layer: { top_domains: [], authority_score: 0.9, primary_source_found: true },
      aeo_layer: {
        snippet_match: true,
        direct_answer: 'yes',
        contradiction_detected: false,
      },
    },
    tripwire_status: 'nominal',
    agent_origin: 'JADE',
    cycle: 'C-384',
  };
}

describe('server write circuit breaker (C-384 PR-6)', () => {
  it('protocol lock blocks writes when GI is below 0.85 even in guarded band', () => {
    const evaluation = evaluateServerWriteFromInputs(0.71, 'stable');
    assert.equal(evaluation.allowed, false);
    assert.equal(evaluation.belowProtocolLock, true);
    assert.ok(evaluation.gi < GI_PROTOCOL_EMERGENCY_LOCK);
  });

  it('allows writes when GI is at or above protocol lock and C-261 permits', () => {
    const evaluation = evaluateServerWriteFromInputs(0.86, 'stable');
    assert.equal(evaluation.allowed, true);
    assert.equal(evaluation.belowProtocolLock, false);
  });

  it('detectEpochGiDrop trips on >5% relative drop', () => {
    assert.equal(detectEpochGiDrop(0.71, 0.76), true);
    assert.equal(detectEpochGiDrop(0.74, 0.76), false);
  });

  it('epoch drop blocks writes even when GI is above protocol lock', () => {
    const evaluation = evaluateServerWriteFromInputs(0.9, 'stable', { epochDropTriggered: true });
    assert.equal(evaluation.epochDropTriggered, true);
    assert.equal(evaluation.allowed, false);
  });

  it('C-261 containment blocks writes below containment threshold', () => {
    const evaluation = evaluateServerWriteFromInputs(0.65, 'stable');
    assert.equal(evaluation.c261.stage, 'containment');
    assert.equal(evaluation.allowed, false);
  });

  it('semantic drift triggers C-261 containment when GI is above containment', () => {
    const evaluation = evaluateServerWriteFromInputs(0.86, 'stable', { semanticDriftDetected: true });
    assert.equal(evaluation.c261.stage, 'containment');
    assert.equal(evaluation.allowed, false);
    assert.ok(evaluation.c261.triggeredBy.includes('semantic_drift'));
  });

  it('resolveTrendEpochGiPair uses trend[0] vs first differing prior point', () => {
    const trend = [
      { gi: 0.71, mode: 'live', timestamp: 't0', gi_verified: true },
      { gi: 0.71, mode: 'live', timestamp: 't1', gi_verified: true },
      { gi: 0.76, mode: 'live', timestamp: 't2', gi_verified: true },
    ];
    const pair = resolveTrendEpochGiPair(trend);
    assert.deepEqual(pair, { current: 0.71, previous: 0.76 });
    assert.equal(detectEpochGiDropFromTrend(trend, 0.86), true);
  });

  it('detectEpochGiDropFromTrend trips when live GI drops from trend head', () => {
    const trend = [{ gi: 0.9, mode: 'live', timestamp: 't0', gi_verified: true }];
    assert.equal(detectEpochGiDropFromTrend(trend, 0.84), true);
  });

  it('detectSemanticDriftFromSignal reads latest JADE/HERMES geo_layer', () => {
    const prior = getLatestIntegritySignal();
    setLatestIntegritySignal(minimalSignal(0.75));
    try {
      assert.equal(detectSemanticDriftFromSignal(), true);
      setLatestIntegritySignal(minimalSignal(0.5));
      assert.equal(detectSemanticDriftFromSignal(), false);
    } finally {
      if (prior) setLatestIntegritySignal(prior);
    }
  });
});
