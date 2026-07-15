// C-373: latest seal pointer repair invariants
// Run: tsx tests/contract/latestSealPointerRepair.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { newestValidCanonicalAttestedSeal } from '@/lib/watchdog/latestSealPointerRepair';
import type { Seal } from '@/lib/vault-v2/types';

function makeSeal(overrides: Partial<Seal> & { seal_id: string }): Seal {
  return {
    status: 'attested',
    sequence: 1,
    cycle_at_seal: 'C-373',
    sealed_at: '2026-07-15T00:00:00.000Z',
    seal_hash: `hash-${overrides.seal_id}`,
    attestations: {},
    deposit_hashes: [],
    source_entries: 1,
    ...overrides,
  } as Seal;
}

describe('latestSealPointerRepair', () => {
  it('selects newest attested seal not in quarantine set', () => {
    const seals = [
      makeSeal({ seal_id: 'old', sealed_at: '2026-07-10T00:00:00.000Z' }),
      makeSeal({ seal_id: 'new', sealed_at: '2026-07-15T00:00:00.000Z' }),
    ];
    const pick = newestValidCanonicalAttestedSeal(seals, new Set());
    assert.equal(pick?.seal_id, 'new');
  });

  it('excludes quarantined seals from newest selection', () => {
    const seals = [
      makeSeal({ seal_id: 'old', sealed_at: '2026-07-10T00:00:00.000Z' }),
      makeSeal({ seal_id: 'new', sealed_at: '2026-07-15T00:00:00.000Z' }),
    ];
    const pick = newestValidCanonicalAttestedSeal(seals, new Set(['new']));
    assert.equal(pick?.seal_id, 'old');
  });

  it('returns null when all attested seals are quarantined', () => {
    const seals = [makeSeal({ seal_id: 'only' })];
    const pick = newestValidCanonicalAttestedSeal(seals, new Set(['only']));
    assert.equal(pick, null);
  });

  it('ignores non-attested seals', () => {
    const seals = [
      makeSeal({ seal_id: 'forming', status: 'forming' as Seal['status'] }),
      makeSeal({ seal_id: 'attested', sealed_at: '2026-07-12T00:00:00.000Z' }),
    ];
    const pick = newestValidCanonicalAttestedSeal(seals, new Set());
    assert.equal(pick?.seal_id, 'attested');
  });
});
