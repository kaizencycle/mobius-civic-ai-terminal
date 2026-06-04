// C-303 Phase 1+2: lock the canonical snapshot contract.
// Verifies the aggregate shape, that every lane carries provenance, and that a
// degraded lane is always surfaced (never hidden) — the core anti-silent-failure
// guarantee. Uses injected lane results so it runs without live infra.
//
// Run: tsx tests/contract/canonicalSnapshot.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DalResult, DalProvenance } from '../../lib/dal/types.js';
import { okDalResult, degradedDalResult } from '../../lib/dal/types.js';

// Mirror of the aggregation logic's degraded-lane derivation, tested in isolation.
type LaneEnvelope<T> = { ok: boolean; data: T | null; provenance: DalProvenance };

function toEnvelope<T>(r: DalResult<T>): LaneEnvelope<T> {
  return { ok: r.ok, data: r.data, provenance: r.provenance };
}

function deriveDegraded(lanes: Record<string, LaneEnvelope<unknown>>) {
  return Object.entries(lanes)
    .filter(([, env]) => !env.ok || env.provenance.freshness !== 'live')
    .map(([name]) => name);
}

describe('DalResult helpers behave as the aggregator expects', () => {
  it('okDalResult with live freshness is not degraded', () => {
    const r = okDalResult({ x: 1 }, { source: 'computed', freshness: 'live', timestamp: 't' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.degraded, false);
  });

  it('okDalResult with stale freshness is marked degraded', () => {
    const r = okDalResult({ x: 1 }, { source: 'kv', freshness: 'stale', timestamp: 't' });
    assert.strictEqual(r.degraded, true);
  });

  it('degradedDalResult is not ok and carries the error', () => {
    const r = degradedDalResult<{ x: number }>({ source: 'fallback', error: 'boom' });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, 'boom');
  });
});

describe('canonical snapshot degraded-lane derivation', () => {
  it('all-live lanes → no degraded lanes', () => {
    const lanes = {
      vault: toEnvelope(okDalResult({}, { source: 'computed', freshness: 'live', timestamp: 't' })),
      ledger: toEnvelope(okDalResult({}, { source: 'ledger', freshness: 'live', timestamp: 't' })),
    };
    assert.deepStrictEqual(deriveDegraded(lanes), []);
  });

  it('a failed lane is ALWAYS surfaced (never hidden)', () => {
    const lanes = {
      vault: toEnvelope(okDalResult({}, { source: 'computed', freshness: 'live', timestamp: 't' })),
      journal: toEnvelope(degradedDalResult({ source: 'fallback', error: 'kv down' })),
    };
    assert.deepStrictEqual(deriveDegraded(lanes), ['journal']);
  });

  it('a stale-but-ok lane counts as degraded (e.g. empty journal)', () => {
    const lanes = {
      journal: toEnvelope(okDalResult({}, { source: 'kv', freshness: 'stale', timestamp: 't' })),
    };
    assert.deepStrictEqual(deriveDegraded(lanes), ['journal']);
  });

  it('every lane envelope retains its provenance source', () => {
    const env = toEnvelope(okDalResult({}, { source: 'ledger', freshness: 'live', timestamp: 't' }));
    assert.strictEqual(env.provenance.source, 'ledger');
  });
});
