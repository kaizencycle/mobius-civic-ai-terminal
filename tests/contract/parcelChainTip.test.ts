// C-372: parcel chain tip merge across repo + KV witness.
// Run: tsx tests/contract/parcelChainTip.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRepoAndKvParcelTip } from '@/lib/journal/parcelChainTip';

describe('parcelChainTip', () => {
  it('mergeRepoAndKvParcelTip prefers later parcel path from KV when repo is behind', async () => {
    const merged = await mergeRepoAndKvParcelTip(
      'a'.repeat(64),
      'canon/journal/C-372/parcel-001.jsonl',
      {
        parcel_hash: 'b'.repeat(64),
        parcel_path: 'canon/journal/C-372/parcel-002.jsonl',
        seal_id: 'seal-C-372-002',
        branch: 'flush/C-372-parcel-002',
        updated_at: '2026-07-14T12:00:00.000Z',
      },
    );
    assert.strictEqual(merged, 'b'.repeat(64));
  });

  it('mergeRepoAndKvParcelTip prefers repo when it is ahead of KV witness', async () => {
    const merged = await mergeRepoAndKvParcelTip(
      'c'.repeat(64),
      'canon/journal/C-372/parcel-003.jsonl',
      {
        parcel_hash: 'b'.repeat(64),
        parcel_path: 'canon/journal/C-372/parcel-002.jsonl',
        seal_id: 'seal-C-372-002',
        branch: 'flush/C-372-parcel-002',
        updated_at: '2026-07-14T12:00:00.000Z',
      },
    );
    assert.strictEqual(merged, 'c'.repeat(64));
  });
});
