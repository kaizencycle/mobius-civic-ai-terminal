// C-373: canonical lineage resolution invariants
// Run: tsx tests/contract/latestSealPointerRepair.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  newestResolvedCanonicalSeal,
  resolveBlockCanonicalSeal,
} from '@/lib/watchdog/canonicalLineageResolve';
import type { Seal } from '@/lib/vault-v2/types';

function makeSeal(overrides: Partial<Seal> & { seal_id: string; sequence?: number }): Seal {
  return {
    status: 'attested',
    sequence: overrides.sequence ?? 1,
    cycle_at_seal: 'C-373',
    sealed_at: '2026-07-15T00:00:00.000Z',
    seal_hash: `hash-${overrides.seal_id}`,
    attestations: {},
    deposit_hashes: [],
    source_entries: 1,
    ...overrides,
  } as Seal;
}

describe('canonicalLineageResolve', () => {
  it('single clean attested seal is accepted', () => {
    const seals = [makeSeal({ seal_id: 'solo', sequence: 1 })];
    const { target, unresolved_blocks } = newestResolvedCanonicalSeal({
      seals,
      quarantined: new Set(),
      canonicalIndex: new Map(),
    });
    assert.equal(target?.seal_id, 'solo');
    assert.deepEqual(unresolved_blocks, []);
  });

  it('newest seal persisted-quarantined selects older resolved canonical', () => {
    const seals = [
      makeSeal({ seal_id: 'old', sequence: 1, sealed_at: '2026-07-10T00:00:00.000Z' }),
      makeSeal({ seal_id: 'new', sequence: 2, sealed_at: '2026-07-15T00:00:00.000Z' }),
    ];
    const { target } = newestResolvedCanonicalSeal({
      seals,
      quarantined: new Set(['new']),
      canonicalIndex: new Map(),
    });
    assert.equal(target?.seal_id, 'old');
  });

  it('unresolved collision block fails closed', () => {
    const seals = [
      makeSeal({ seal_id: 'a', sequence: 5, seal_hash: 'h1' }),
      makeSeal({ seal_id: 'b', sequence: 5, seal_hash: 'h2' }),
    ];
    const { target, unresolved_blocks } = newestResolvedCanonicalSeal({
      seals,
      quarantined: new Set(),
      canonicalIndex: new Map([[5, null]]),
    });
    assert.equal(target, null);
    assert.deepEqual(unresolved_blocks, [5]);
  });

  it('canonical index resolves a collision', () => {
    const seals = [
      makeSeal({ seal_id: 'keep', sequence: 3, sealed_at: '2026-07-10T00:00:00.000Z' }),
      makeSeal({ seal_id: 'drop', sequence: 3, sealed_at: '2026-07-15T00:00:00.000Z' }),
    ];
    const { target } = newestResolvedCanonicalSeal({
      seals,
      quarantined: new Set(['drop']),
      canonicalIndex: new Map([[3, 'keep']]),
    });
    assert.equal(target?.seal_id, 'keep');
  });

  it('canonical index pointing to missing seal is unresolved', () => {
    const result = resolveBlockCanonicalSeal(
      7,
      [makeSeal({ seal_id: 'a', sequence: 7 }), makeSeal({ seal_id: 'b', sequence: 7 })],
      new Set(),
      'missing',
    );
    assert.equal(result.unresolved, true);
  });

  it('canonical index pointing to wrong block is unresolved', () => {
    const result = resolveBlockCanonicalSeal(
      7,
      [makeSeal({ seal_id: 'a', sequence: 7 }), makeSeal({ seal_id: 'b', sequence: 7 })],
      new Set(),
      'a',
    );
    assert.equal(result.unresolved, false);
    const wrongBlock = resolveBlockCanonicalSeal(
      7,
      [makeSeal({ seal_id: 'x', sequence: 8 })],
      new Set(),
      'x',
    );
    assert.equal(wrongBlock.unresolved, true);
  });

  it('canonical index pointing to quarantined seal is unresolved', () => {
    const result = resolveBlockCanonicalSeal(
      4,
      [makeSeal({ seal_id: 'a', sequence: 4 }), makeSeal({ seal_id: 'b', sequence: 4 })],
      new Set(['a']),
      'a',
    );
    assert.equal(result.unresolved, true);
  });

  it('pending canonical from receipt resolves block before index is persisted', () => {
    const seals = [
      makeSeal({ seal_id: 'keep', sequence: 9, sealed_at: '2026-07-12T00:00:00.000Z' }),
      makeSeal({ seal_id: 'drop', sequence: 9, sealed_at: '2026-07-14T00:00:00.000Z' }),
      makeSeal({ seal_id: 'latest', sequence: 10, sealed_at: '2026-07-15T00:00:00.000Z' }),
    ];
    const { target } = newestResolvedCanonicalSeal({
      seals,
      quarantined: new Set(['drop']),
      canonicalIndex: new Map([[10, 'latest']]),
      pendingCanonical: new Map([[9, 'keep']]),
    });
    assert.equal(target?.seal_id, 'latest');
  });

  it('no resolved canonical target when all blocks unresolved', () => {
    const seals = [
      makeSeal({ seal_id: 'a', sequence: 1 }),
      makeSeal({ seal_id: 'b', sequence: 1 }),
    ];
    const { target } = newestResolvedCanonicalSeal({
      seals,
      quarantined: new Set(),
      canonicalIndex: new Map(),
    });
    assert.equal(target, null);
  });
});
