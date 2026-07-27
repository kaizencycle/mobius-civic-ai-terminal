// C-384 PR-6: server write circuit breaker (C-261 + protocol 0.85 + epoch drop).
// Run: tsx tests/contract/serverWriteCircuitBreaker.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  GI_PROTOCOL_EMERGENCY_LOCK,
  detectEpochGiDrop,
  detectEpochGiDropFromTrend,
  evaluateServerWriteFromInputs,
  isGiSnapshotTrustedForWrites,
  pickAuthoritativeSemanticDrift,
  resolveSemanticDriftDetected,
  resolveTrendEpochGiPair,
  semanticDriftScoreTrips,
} from '../../lib/gi/serverWriteCircuitBreaker.ts';
import {
  getLatestIntegritySignal,
  integritySignalDriftRow,
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
    assert.equal(detectEpochGiDropFromTrend(trend, 0.71), true);
  });

  it('stale trend does not block writes when live GI recovered vs prior epoch', () => {
    const trend = [
      { gi: 0.71, mode: 'live', timestamp: 't0', gi_verified: true },
      { gi: 0.71, mode: 'live', timestamp: 't1', gi_verified: true },
      { gi: 0.76, mode: 'live', timestamp: 't2', gi_verified: true },
    ];
    assert.equal(detectEpochGiDropFromTrend(trend, 0.9), false);
  });

  it('detectEpochGiDropFromTrend trips when live GI drops from trend head', () => {
    const trend = [{ gi: 0.9, mode: 'live', timestamp: 't0', gi_verified: true }];
    assert.equal(detectEpochGiDropFromTrend(trend, 0.84), true);
  });

  it('isGiSnapshotTrustedForWrites rejects mock, cached, and stale kv', () => {
    const fresh = new Date().toISOString();
    assert.equal(isGiSnapshotTrustedForWrites({ source: 'kv', timestamp: fresh }), true);
    assert.equal(isGiSnapshotTrustedForWrites({ source: 'live', timestamp: fresh }), true);
    assert.equal(isGiSnapshotTrustedForWrites({ source: 'cached', timestamp: fresh }), false);
    assert.equal(isGiSnapshotTrustedForWrites({ source: 'mock', timestamp: fresh }), false);
    const stale = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    assert.equal(isGiSnapshotTrustedForWrites({ source: 'kv', timestamp: stale }), false);
  });

  it('gi provenance block pauses writes even when GI is high', () => {
    const evaluation = evaluateServerWriteFromInputs(0.92, 'stable', { giProvenanceBlocked: true });
    assert.equal(evaluation.allowed, false);
    assert.equal(evaluation.giProvenanceBlocked, true);
  });

  it('pickAuthoritativeSemanticDrift prefers newest timestamp (stale KV vs recovered local)', () => {
    const drift = pickAuthoritativeSemanticDrift(
      { semantic_drift: 0.4, timestamp: '2026-07-27T02:00:00.000Z' },
      { semantic_drift: 0.9, timestamp: '2026-07-27T01:00:00.000Z' },
    );
    assert.equal(semanticDriftScoreTrips(drift), false);
  });

  it('pickAuthoritativeSemanticDrift prefers newer KV over stale in-process high drift', () => {
    const drift = pickAuthoritativeSemanticDrift(
      { semantic_drift: 0.85, timestamp: '2026-07-27T01:00:00.000Z' },
      { semantic_drift: 0.3, timestamp: '2026-07-27T02:00:00.000Z' },
    );
    assert.equal(semanticDriftScoreTrips(drift), false);
  });

  it('integritySignalDriftRow skips KV row when semantic_drift is missing', () => {
    const row = integritySignalDriftRow({
      ...minimalSignal(0.5),
      layers: {
        ...minimalSignal(0.5).layers,
        geo_layer: { ai_consensus: 'aligned', citation_count: 1, semantic_drift: Number.NaN },
      },
    });
    assert.equal(row, null);
  });

  it('pickAuthoritativeSemanticDrift keeps persisted high drift when local omits geo drift', () => {
    const drift = pickAuthoritativeSemanticDrift(null, {
      semantic_drift: 0.85,
      timestamp: '2026-07-27T02:00:00.000Z',
    });
    assert.equal(semanticDriftScoreTrips(drift), true);
  });

  it('resolveSemanticDriftDetected reads in-process and persisted KV drift', async () => {
    const prior = getLatestIntegritySignal();
    setLatestIntegritySignal(minimalSignal(0.75));
    try {
      assert.equal(await resolveSemanticDriftDetected(), true);
      setLatestIntegritySignal(minimalSignal(0.5));
      assert.equal(semanticDriftScoreTrips(0.75), true);
      assert.equal(semanticDriftScoreTrips(0.5), false);
      assert.equal(await resolveSemanticDriftDetected(), false);
    } finally {
      if (prior) setLatestIntegritySignal(prior);
    }
  });
});
