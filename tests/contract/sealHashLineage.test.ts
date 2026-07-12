// C-370: hot KV prev_seal_hash lineage component analysis.
// Run: tsx tests/contract/sealHashLineage.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Seal } from '@/lib/vault-v2/types';
import { analyzeSealHashLineage } from '@/lib/dat/sealHashLineage';

function baseSeal(overrides: Partial<Seal> & Pick<Seal, 'seal_id' | 'sequence' | 'seal_hash'>): Seal {
  return {
    cycle_at_seal: 'C-359',
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

describe('seal hash lineage', () => {
  it('detects two disconnected lineage components', () => {
    const seals: Seal[] = [
      baseSeal({ seal_id: 'seal-C-359-001', sequence: 1, seal_hash: 'hash-a1', prev_seal_hash: null }),
      baseSeal({ seal_id: 'seal-C-359-002', sequence: 2, seal_hash: 'hash-a2', prev_seal_hash: 'hash-a1' }),
      baseSeal({
        seal_id: 'seal-C-351-111',
        sequence: 111,
        cycle_at_seal: 'C-351',
        seal_hash: 'hash-b111',
        prev_seal_hash: 'hash-b110',
        fountain_status: 'activating',
      }),
      baseSeal({
        seal_id: 'seal-C-351-112',
        sequence: 112,
        cycle_at_seal: 'C-351',
        seal_hash: 'hash-b112',
        prev_seal_hash: 'hash-b111',
        fountain_status: 'activating',
      }),
    ];

    const report = analyzeSealHashLineage(seals);
    assert.strictEqual(report.components.length, 2);
    assert.strictEqual(report.multiple_lineages, true);
    assert.ok(report.link_issues.some((i) => i.issue === 'orphan_prev' && i.seal_id === 'seal-C-351-111'));
  });

  it('flags bulk re-attest substrate_attested_at clusters', () => {
    const seals: Seal[] = Array.from({ length: 6 }, (_, i) =>
      baseSeal({
        seal_id: `seal-C-352-${113 + i}`,
        sequence: 113 + i,
        cycle_at_seal: 'C-352',
        seal_hash: `hash-${113 + i}`,
        sealed_at: `2026-06-${String(20 + i * 2).padStart(2, '0')}T12:00:00.000Z`,
        substrate_attested_at: '2026-06-30T16:04:00.000Z',
        fountain_status: 'activating',
      }),
    );

    const report = analyzeSealHashLineage(seals);
    assert.strictEqual(report.reattest_clusters.length, 1);
    assert.strictEqual(report.reattest_clusters[0].seal_count, 6);
  });
});
