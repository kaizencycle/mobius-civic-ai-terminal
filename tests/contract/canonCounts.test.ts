// C-332: canon must not report substrate immortalization it does not have.
// Reproduces the live condition: 50 locally-attested blocks, 0 substrate
// pointers, all ledger-400 — counts.attested(local) stays honest, and the new
// counts.substrate_immortalized correctly reads 0. Prevents the "50/50 attested"
// contradiction with the vault coverage block.
//
// Run: tsx tests/contract/canonCounts.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCanonCountsForTest } from '../../lib/substrate/canon.ts';
import type { CanonReserveBlockView } from '../../lib/substrate/canon.ts';

function block(opts: {
  status?: string;
  attestation_state?: string;
  attestation_id?: string | null;
  event_hash?: string | null;
  error?: string | null;
}): CanonReserveBlockView {
  return {
    type: 'reserve_block',
    block_number: 1,
    amount: 50,
    status: (opts.status ?? 'attested') as CanonReserveBlockView['status'],
    fountain_status: 'locked',
    seal_id: 's',
    seal_hash: 'h',
    previous_seal_hash: null,
    cycle_at_seal: 'C-332',
    sealed_at: new Date().toISOString(),
    gi_at_seal: 0.8,
    mode_at_seal: 'green',
    source_entries: 0,
    deposit_hashes_count: 0,
    attestation_state: (opts.attestation_state ?? 'complete') as CanonReserveBlockView['attestation_state'],
    missing_agents: [],
    attestations: [],
    substrate_pointer: {
      attestation_id: opts.attestation_id ?? null,
      event_hash: opts.event_hash ?? null,
      attested_at: null,
      error: opts.error ?? null,
    },
    replay_promotion: null,
    needs_reattestation: false,
    historical_digest: null,
  } as unknown as CanonReserveBlockView;
}

describe('canon counts separate local attestation from substrate immortalization', () => {
  it('LIVE C-332: 50 locally-attested, 0 substrate pointers, all ledger-400', () => {
    const blocks = Array.from({ length: 50 }, () =>
      block({
        status: 'attested',
        attestation_state: 'complete',
        error: 'Error: ledger 400: {"detail":"No API base configured for terminal"}',
      }),
    );
    const c = buildCanonCountsForTest(blocks);
    // local attestation is a real fact and stays as-is
    assert.strictEqual(c.attested, 50);
    // but substrate immortalization is honestly ZERO — no false 50/50
    assert.strictEqual(c.substrate_immortalized, 0);
    assert.strictEqual(c.substrate_errored, 50);
  });

  it('a truly immortalized block counts in both', () => {
    const c = buildCanonCountsForTest([
      block({ status: 'attested', attestation_state: 'complete', attestation_id: 'evt-1', event_hash: 'h1' }),
    ]);
    assert.strictEqual(c.attested, 1);
    assert.strictEqual(c.substrate_immortalized, 1);
    assert.strictEqual(c.substrate_errored, 0);
  });

  it('id without hash is NOT immortalized', () => {
    const c = buildCanonCountsForTest([
      block({ status: 'attested', attestation_state: 'complete', attestation_id: 'evt-1', event_hash: null }),
    ]);
    assert.strictEqual(c.substrate_immortalized, 0);
  });

  it('mixed set tallies independently', () => {
    const c = buildCanonCountsForTest([
      block({ attestation_id: 'a', event_hash: 'h' }), // immortalized
      block({ error: 'ledger 400' }), // errored, locally attested
      block({ status: 'quarantined', attestation_state: 'timed_out' }),
    ]);
    assert.strictEqual(c.substrate_immortalized, 1);
    assert.strictEqual(c.substrate_errored, 1);
    assert.strictEqual(c.quarantined_timeout, 1);
  });
});
