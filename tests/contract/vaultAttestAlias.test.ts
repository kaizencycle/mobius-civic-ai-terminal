// C-376: /api/vault/attest quorum registration alias.
// Run: tsx tests/contract/vaultAttestAlias.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '@/app/api/vault/attest/route';

describe('vaultAttestAlias', () => {
  it('GET /api/vault/attest returns route liveness without KV', async () => {
    const res = await GET();
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      ok?: boolean;
      route?: string;
      canonical?: string;
      methods?: string[];
    };
    assert.equal(body.ok, true);
    assert.equal(body.route, '/api/vault/attest');
    assert.equal(body.canonical, '/api/vault/seal/attest');
    assert.ok(body.methods?.includes('POST'));
  });
});
