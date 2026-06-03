/**
 * C-331 contract gate: locks the "why degraded" derivation, including the
 * exact live scenario from the EVE review: GI degraded, vault offline on a
 * ledger 400, multiple lanes degraded → operator gets primary cause + recovery.
 *
 * Run: node --experimental-strip-types --test tests/contract/deriveIntegrityCause.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveIntegrityCause } from '../../lib/integrity/deriveIntegrityCause.ts';
import type { SnapshotLaneState, SnapshotLaneKey, SnapshotLaneSemanticState } from '../../lib/terminal/snapshotLanes.ts';

function lane(
  key: SnapshotLaneKey,
  state: SnapshotLaneSemanticState,
  message = '',
): SnapshotLaneState {
  return {
    key,
    ok: state === 'healthy',
    state,
    statusCode: state === 'offline' ? 400 : null,
    message,
    lastUpdated: null,
    fallbackMode: state === 'healthy' ? 'live' : 'cached',
  };
}

describe('nominal posture', () => {
  it('all lanes healthy + green GI → nominal, no cause', () => {
    const c = deriveIntegrityCause(0.9, [lane('integrity', 'healthy'), lane('vault', 'healthy')]);
    assert.strictEqual(c.severity, 'nominal');
    assert.strictEqual(c.primary_cause, null);
    assert.strictEqual(c.recovery, null);
    assert.strictEqual(c.impact, 'All 2 lanes healthy');
  });
});

describe('LIVE scenario from EVE review (vault offline, ledger 400, 7 of 8 lanes degraded)', () => {
  const lanes = [
    lane('vault',     'offline',   'substrate attestation failed: ledger 400 No API base'),
    lane('epicon',    'degraded',  'verification pending'),
    lane('journal',   'degraded',  ''),
    lane('signals',   'stale',     ''),
    lane('integrity', 'degraded',  ''),
    lane('agents',    'degraded',  ''),
    lane('sentiment', 'stale',     ''),
    lane('kvHealth',  'healthy',   ''),
  ];
  const c = deriveIntegrityCause(0.75, lanes);

  it('names ledger attestation as the primary cause (vault offline wins)', () => {
    assert.strictEqual(c.primary_lane, 'vault');
    assert.strictEqual(c.primary_cause, 'Ledger attestation unavailable');
  });

  it('gives an actionable recovery direction referencing the ledger', () => {
    assert.ok(/ledger/i.test(c.recovery ?? ''));
  });

  it('quantifies impact as 7 of 8 lanes degraded', () => {
    assert.strictEqual(c.impact, '7 of 8 lanes degraded');
  });

  it('severity is critical because vault is offline', () => {
    assert.strictEqual(c.severity, 'critical');
  });

  it('contributing lanes are ranked worst-first (offline before degraded before stale)', () => {
    assert.strictEqual(c.contributing_lanes[0].key, 'vault');
    assert.strictEqual(c.contributing_lanes[0].state, 'offline');
    const states = c.contributing_lanes.map((l) => l.state);
    assert.ok(states.indexOf('degraded') < states.indexOf('stale'));
  });
});

describe('single degraded lane', () => {
  it('reports the lane key in impact and names the cause', () => {
    const c = deriveIntegrityCause(0.82, [lane('kvHealth', 'degraded'), lane('integrity', 'healthy')]);
    assert.strictEqual(c.impact, '1 of 2 lanes degraded (kvHealth)');
    assert.strictEqual(c.primary_cause, 'KV store unavailable');
  });
});

describe('GI/lane disagreement is surfaced honestly', () => {
  it('yellow GI + all lanes healthy → flags the disagreement, does not fabricate a cause', () => {
    const c = deriveIntegrityCause(0.65, [lane('integrity', 'healthy'), lane('vault', 'healthy')]);
    assert.strictEqual(c.mode, 'yellow');
    assert.ok((c.primary_cause ?? '').includes('no degraded lane'));
    assert.ok(/GI source|GI calc|disagree/i.test(c.impact + (c.recovery ?? '')));
  });
});

describe('null GI is handled', () => {
  it('null GI → mode null, still derives primary lane from degraded lanes', () => {
    const c = deriveIntegrityCause(null, [lane('epicon', 'degraded', 'pending')]);
    assert.strictEqual(c.mode, null);
    assert.strictEqual(c.primary_lane, 'epicon');
  });
});

describe('unmapped lane key falls back to the lane message', () => {
  it('promotion key (no specific case) uses lane.message as the cause', () => {
    const c = deriveIntegrityCause(0.7, [lane('promotion', 'degraded', 'promotion backlog high')]);
    assert.strictEqual(c.primary_lane, 'promotion');
    assert.strictEqual(c.primary_cause, 'promotion backlog high');
  });
});
