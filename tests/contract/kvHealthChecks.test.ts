// C-370: EVE KV watchdog pure check helpers.
// Run: tsx tests/contract/kvHealthChecks.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Seal } from '@/lib/vault-v2/types';
import {
  checkBlockCollisions,
  checkReattestSpike,
  maxSeverity,
  REATTEST_HOURLY_SPIKE_THRESHOLD,
} from '@/lib/watchdog/kvHealthChecks';

function baseSeal(overrides: Partial<Seal> & Pick<Seal, 'seal_id' | 'sequence' | 'seal_hash'>): Seal {
  return {
    cycle_at_seal: 'C-370',
    sealed_at: '2026-07-01T00:00:00.000Z',
    reserve: 50,
    gi_at_seal: 0.8,
    mode_at_seal: 'yellow',
    source_entries: 1,
    deposit_hashes: [],
    prev_seal_hash: null,
    attestations: {},
    status: 'attested',
    fountain_status: 'pending',
    fountain_emitted_at: null,
    posture: null,
    ...overrides,
  };
}

describe('kvHealthChecks', () => {
  it('maxSeverity picks highest tier', () => {
    const max = maxSeverity([
      { check: 'kv_write_canary', severity: 'ok', ok: true, message: 'ok' },
      { check: 'block_number_collisions', severity: 'critical', ok: false, message: 'bad' },
      { check: 'latest_seal_key_freshness', severity: 'warning', ok: false, message: 'stale' },
    ]);
    assert.strictEqual(max, 'critical');
  });

  it('checkBlockCollisions flags hash-divergent pairs', () => {
    const seals: Seal[] = [
      baseSeal({ seal_id: 'seal-C-359-001', sequence: 1, seal_hash: 'hash-a', sealed_at: '2026-07-01T09:00:00Z' }),
      baseSeal({ seal_id: 'seal-C-332-001', sequence: 1, seal_hash: 'hash-b', sealed_at: '2026-06-05T04:00:00Z' }),
    ];
    const finding = checkBlockCollisions(seals);
    assert.strictEqual(finding.ok, false);
    assert.strictEqual(finding.severity, 'critical');
    assert.strictEqual(finding.check, 'block_number_collisions');
  });

  it('checkReattestSpike warns above hourly threshold', () => {
    const now = Date.parse('2026-06-30T21:00:00Z');
    const seals: Seal[] = Array.from({ length: REATTEST_HOURLY_SPIKE_THRESHOLD + 5 }, (_, i) =>
      baseSeal({
        seal_id: `seal-C-352-${i}`,
        sequence: i + 1,
        seal_hash: `hash-${i}`,
        substrate_attested_at: '2026-06-30T20:30:00.000Z',
      }),
    );
    const finding = checkReattestSpike(seals, now);
    assert.strictEqual(finding.ok, false);
    assert.strictEqual(finding.severity, 'warning');
  });
});
