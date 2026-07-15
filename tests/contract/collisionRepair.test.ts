// C-373: collision repair validation (no live KV)
// Run: tsx tests/contract/collisionRepair.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCollisionAuditReport } from '@/lib/watchdog/collisionAudit';
import { validateReceiptForRepair } from '@/lib/watchdog/collisionRepair';
import {
  buildReceiptFromCollision,
  sealReceipt,
} from '@/lib/watchdog/reconciliationReceipt';
import type { Seal } from '@/lib/vault-v2/types';

function makeSeal(overrides: Partial<Seal> & { sequence: number; seal_id: string }): Seal {
  return {
    status: 'attested',
    cycle_at_seal: 'C-373',
    sealed_at: '2026-07-15T00:00:00.000Z',
    seal_hash: `hash-${overrides.seal_id}`,
    attestations: {},
    deposit_hashes: [],
    source_entries: 1,
    ...overrides,
  } as Seal;
}

describe('collisionRepair validation', () => {
  it('rejects unapproved receipt', async () => {
    const seals = [
      makeSeal({ sequence: 1, seal_id: 'a', seal_hash: 'h1' }),
      makeSeal({ sequence: 1, seal_id: 'b', seal_hash: 'h2' }),
    ];
    const audit = buildCollisionAuditReport(seals, { cycle: 'C-373' });
    const receipt = buildReceiptFromCollision({
      audit,
      block_number: 1,
      canonical_seal_id: 'a',
      canonical_reason: ['test'],
      receipt_id: 'rcpt-val-1',
    });
    const result = await validateReceiptForRepair(receipt, seals);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('not approved')));
  });

  it('rejects when canonical seal missing', async () => {
    const seals = [makeSeal({ sequence: 1, seal_id: 'b', seal_hash: 'h2' })];
    const audit = buildCollisionAuditReport(
      [
        makeSeal({ sequence: 1, seal_id: 'a', seal_hash: 'h1' }),
        makeSeal({ sequence: 1, seal_id: 'b', seal_hash: 'h2' }),
      ],
      { cycle: 'C-373' },
    );
    const proposed = buildReceiptFromCollision({
      audit,
      block_number: 1,
      canonical_seal_id: 'a',
      canonical_reason: ['test'],
      receipt_id: 'rcpt-val-2',
    });
    const receipt = sealReceipt({
      ...proposed,
      resolution_status: 'approved',
      human_approval: 'approved',
      zeus_verdict: 'approved',
      eve_verdict: 'approved',
    });
    const result = await validateReceiptForRepair(receipt, seals);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('canonical seal missing')));
  });

  it('rejects stale KV when seal hash changed after audit', async () => {
    const seals = [
      makeSeal({ sequence: 1, seal_id: 'a', seal_hash: 'h1-changed' }),
      makeSeal({ sequence: 1, seal_id: 'b', seal_hash: 'h2' }),
    ];
    const audit = buildCollisionAuditReport(
      [
        makeSeal({ sequence: 1, seal_id: 'a', seal_hash: 'h1-original' }),
        makeSeal({ sequence: 1, seal_id: 'b', seal_hash: 'h2' }),
      ],
      { cycle: 'C-373' },
    );
    const proposed = buildReceiptFromCollision({
      audit,
      block_number: 1,
      canonical_seal_id: 'a',
      canonical_reason: ['test'],
      receipt_id: 'rcpt-val-3',
    });
    const receipt = sealReceipt({
      ...proposed,
      resolution_status: 'approved',
      human_approval: 'approved',
      zeus_verdict: 'approved',
      eve_verdict: 'approved',
    });
    const result = await validateReceiptForRepair(receipt, seals);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('stale')));
  });

  it('accepts approved receipt when KV snapshot matches', async () => {
    const seals = [
      makeSeal({ sequence: 1, seal_id: 'a', seal_hash: 'h1' }),
      makeSeal({ sequence: 1, seal_id: 'b', seal_hash: 'h2' }),
    ];
    const audit = buildCollisionAuditReport(seals, { cycle: 'C-373' });
    const proposed = buildReceiptFromCollision({
      audit,
      block_number: 1,
      canonical_seal_id: 'a',
      canonical_reason: ['substrate evidence', 'human approval'],
      receipt_id: 'rcpt-val-4',
    });
    const receipt = sealReceipt({
      ...proposed,
      resolution_status: 'approved',
      human_approval: 'approved',
      zeus_verdict: 'approved',
      eve_verdict: 'approved',
    });
    const result = await validateReceiptForRepair(receipt, seals);
    assert.equal(result.ok, true);
  });
});
