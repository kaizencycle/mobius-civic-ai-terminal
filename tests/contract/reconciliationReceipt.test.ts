// C-373: reconciliation receipt invariants
// Run: tsx tests/contract/reconciliationReceipt.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCollisionAuditReport } from '@/lib/watchdog/collisionAudit';
import {
  buildReceiptFromCollision,
  computeReceiptHash,
  isReceiptApprovedForRepair,
  sealReceipt,
  verifyKvSnapshotUnchanged,
  verifyReceiptHash,
  type SealCollisionResolutionReceipt,
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

function approvedReceipt(receipt: SealCollisionResolutionReceipt): SealCollisionResolutionReceipt {
  const { receipt_hash, ...body } = receipt;
  return sealReceipt({
    ...body,
    resolution_status: 'approved',
    human_approval: 'approved',
    zeus_verdict: 'approved',
    eve_verdict: 'approved',
  });
}

describe('reconciliationReceipt', () => {
  it('builds receipt from audit with original hashes preserved', () => {
    const seals = [
      makeSeal({ sequence: 7, seal_id: 'keep', seal_hash: 'h1' }),
      makeSeal({ sequence: 7, seal_id: 'drop', seal_hash: 'h2' }),
    ];
    const audit = buildCollisionAuditReport(seals, { cycle: 'C-373' });
    const receipt = buildReceiptFromCollision({
      audit,
      block_number: 7,
      canonical_seal_id: 'keep',
      canonical_reason: ['substrate ledger evidence', 'human operator approval'],
      receipt_id: 'rcpt-test-7',
    });
    assert.equal(receipt.conflicting_seal_ids.length, 1);
    assert.equal(receipt.original_hashes.keep, 'h1');
    assert.equal(receipt.original_hashes.drop, 'h2');
    assert.ok(verifyReceiptHash(receipt));
  });

  it('rejects unapproved receipt for repair', () => {
    const seals = [
      makeSeal({ sequence: 1, seal_id: 'a', seal_hash: 'h1' }),
      makeSeal({ sequence: 1, seal_id: 'b', seal_hash: 'h2' }),
    ];
    const audit = buildCollisionAuditReport(seals, { cycle: 'C-373' });
    const proposed = buildReceiptFromCollision({
      audit,
      block_number: 1,
      canonical_seal_id: 'a',
      canonical_reason: ['test'],
      receipt_id: 'rcpt-unapproved',
    });
    assert.equal(isReceiptApprovedForRepair(proposed), false);
  });

  it('accepts approved hash-divergent receipt when ZEUS and EVE approve', () => {
    const seals = [
      makeSeal({ sequence: 1, seal_id: 'a', seal_hash: 'h1' }),
      makeSeal({ sequence: 1, seal_id: 'b', seal_hash: 'h2' }),
    ];
    const audit = buildCollisionAuditReport(seals, { cycle: 'C-373' });
    const proposed = buildReceiptFromCollision({
      audit,
      block_number: 1,
      canonical_seal_id: 'a',
      canonical_reason: ['test'],
      receipt_id: 'rcpt-approved',
    });
    const receipt = approvedReceipt(proposed);
    assert.equal(isReceiptApprovedForRepair(receipt), true);
  });

  it('rejects tampered receipt hash', () => {
    const seals = [
      makeSeal({ sequence: 2, seal_id: 'a', seal_hash: 'h1' }),
      makeSeal({ sequence: 2, seal_id: 'b', seal_hash: 'h2' }),
    ];
    const audit = buildCollisionAuditReport(seals, { cycle: 'C-373' });
    const receipt = buildReceiptFromCollision({
      audit,
      block_number: 2,
      canonical_seal_id: 'a',
      canonical_reason: ['test'],
      receipt_id: 'rcpt-tamper',
    });
    const tampered = { ...receipt, canonical_seal_id: 'evil' };
    assert.equal(verifyReceiptHash(tampered), false);
  });

  it('detects stale KV state when seal hash changed', () => {
    const check = verifyKvSnapshotUnchanged(
      {
        kv_snapshot: { a: 'hash-old' },
      } as unknown as SealCollisionResolutionReceipt,
      { a: 'hash-new' },
    );
    assert.equal(check.ok, false);
    assert.deepEqual(check.stale, ['a']);
  });

  it('receipt hash is stable for same body', () => {
    const body = {
      schema_version: '1.0' as const,
      receipt_type: 'seal_collision_resolution' as const,
      receipt_id: 'rcpt-stable',
      cycle: 'C-373',
      block_number: 1,
      canonical_seal_id: 'a',
      conflicting_seal_ids: ['b'],
      canonical_reason: ['r'],
      evidence_refs: [],
      original_hashes: { a: 'h1', b: 'h2' },
      kv_snapshot: { a: 'h1', b: 'h2' },
      resolution_status: 'proposed' as const,
      zeus_verdict: 'pending' as const,
      eve_verdict: 'pending' as const,
      human_approval: 'pending' as const,
      created_at: '2026-07-15T00:00:00.000Z',
    };
    assert.equal(computeReceiptHash(body), computeReceiptHash(body));
  });
});
