// C-329: lock the "no silent attestation failure" guarantee.
// Reproduces the live condition observed at /api/vault/status on C-329:
// 173 seals report "sealed" while 0 carry a substrate_attestation_id —
// the gap MUST be visible (has_gap true, immortalized 0), never masked.
//
// Run: tsx tests/contract/attestationCoverage.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAttestationCoverage,
  attestationHeadlineSuffix,
} from '../../lib/vault/attestation-coverage.js';

function seal(opts: {
  id: string;
  cycle: string;
  attId?: string | null;
  hash?: string | null;
  error?: string | null;
}) {
  return {
    seal_id: opts.id,
    cycle_at_seal: opts.cycle,
    substrate_attestation_id: opts.attId ?? null,
    substrate_event_hash: opts.hash ?? null,
    substrate_attestation_error: opts.error ?? null,
  } as any;
}

describe('attestation coverage exposes the silent-failure gap', () => {
  it('LIVE C-329 case: 173 sealed, 0 immortalized → gap is visible', () => {
    const seals = Array.from({ length: 173 }, (_, i) =>
      seal({
        id: `seal-C-329-${i + 1}`,
        cycle: 'C-329',
        error: 'ledger 400: {"detail":"No API base configured for terminal"}',
      }),
    );
    const cov = computeAttestationCoverage(seals);
    assert.strictEqual(cov.examined, 173);
    assert.strictEqual(cov.immortalized, 0);
    assert.strictEqual(cov.errored, 173);
    assert.strictEqual(cov.has_gap, true);
    assert.strictEqual(cov.coverage_ratio, 0);
    assert.ok(cov.latest_error?.includes('No API base configured'));
    const suffix = attestationHeadlineSuffix(cov);
    assert.ok(suffix.includes('0 attested to Substrate'), `suffix was: "${suffix}"`);
  });

  it('all immortalized → no gap, empty suffix', () => {
    const seals = [
      seal({ id: 's1', cycle: 'C-328', attId: 'evt-1', hash: 'h1' }),
      seal({ id: 's2', cycle: 'C-329', attId: 'evt-2', hash: 'h2' }),
    ];
    const cov = computeAttestationCoverage(seals);
    assert.strictEqual(cov.immortalized, 2);
    assert.strictEqual(cov.has_gap, false);
    assert.strictEqual(cov.coverage_ratio, 1);
    assert.strictEqual(attestationHeadlineSuffix(cov), '');
  });

  it('partial coverage → ratio and suffix reflect reality', () => {
    const seals = [
      seal({ id: 's1', cycle: 'C-327', attId: 'evt-1', hash: 'h1' }),
      seal({ id: 's2', cycle: 'C-328', error: 'timeout' }),
      seal({ id: 's3', cycle: 'C-329' }),
    ];
    const cov = computeAttestationCoverage(seals);
    assert.strictEqual(cov.immortalized, 1);
    assert.strictEqual(cov.errored, 1);
    assert.strictEqual(cov.unattested, 1);
    assert.strictEqual(cov.has_gap, true);
    assert.strictEqual(cov.coverage_ratio, 0.3333);
    assert.ok(attestationHeadlineSuffix(cov).includes('1/3 attested'));
    assert.strictEqual(cov.gap_cycle_range, 'C-328 → C-329');
  });

  it('id+hash both required for immortalization (id alone is not enough)', () => {
    const seals = [seal({ id: 's1', cycle: 'C-329', attId: 'evt-1', hash: null })];
    const cov = computeAttestationCoverage(seals);
    assert.strictEqual(cov.immortalized, 0);
    assert.strictEqual(cov.has_gap, true);
  });

  it('empty seal set → no gap, null ratio', () => {
    const cov = computeAttestationCoverage([]);
    assert.strictEqual(cov.examined, 0);
    assert.strictEqual(cov.coverage_ratio, null);
    assert.strictEqual(cov.has_gap, false);
    assert.strictEqual(attestationHeadlineSuffix(cov), '');
  });
});
