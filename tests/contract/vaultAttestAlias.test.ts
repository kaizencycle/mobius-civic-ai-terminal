// C-376: /api/vault/attest C-298 quorum registration.
// Run: tsx tests/contract/vaultAttestAlias.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GET, POST } from '@/app/api/vault/attest/route';
import { parseSentinelQuorumSubmission } from '@/lib/mic/quorumAttestation';

function jsonRequest(body: unknown, authorization?: string): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (authorization) headers.set('authorization', authorization);
  return new Request('http://localhost/api/vault/attest', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('parseSentinelQuorumSubmission', () => {
  it('accepts documented C-298 quorum payload', () => {
    const parsed = parseSentinelQuorumSubmission({
      agent: 'ZEUS',
      cycle: 'C-376',
      confidence: 0.81,
      source: 'zeus-verification',
    });
    assert.notEqual(typeof parsed, 'string');
    if (typeof parsed === 'string') return;
    assert.equal(parsed.agent, 'ZEUS');
    assert.equal(parsed.cycle, 'C-376');
    assert.equal(parsed.confidence, 0.81);
    assert.equal(parsed.source, 'zeus-verification');
  });

  it('rejects seal-candidate attestation payloads', () => {
    const parsed = parseSentinelQuorumSubmission({
      seal_id: 'seal-C-376-001',
      agent: 'ZEUS',
      verdict: 'pass',
      rationale: 'ok',
      signature: 'abc',
    });
    assert.equal(typeof parsed, 'string');
  });
});

describe('vaultAttestAlias', () => {
  it('GET /api/vault/attest returns route liveness without KV', async () => {
    const res = await GET();
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      ok?: boolean;
      route?: string;
      seal_attestation_route?: string;
      methods?: string[];
      purpose?: string;
    };
    assert.equal(body.ok, true);
    assert.equal(body.route, '/api/vault/attest');
    assert.equal(body.seal_attestation_route, '/api/vault/seal/attest');
    assert.ok(body.methods?.includes('POST'));
    assert.match(body.purpose ?? '', /quorum registration/i);
  });

  it('POST rejects C-298 payload without authorization', async () => {
    const prior = process.env.AGENT_SERVICE_TOKEN;
    process.env.AGENT_SERVICE_TOKEN = 'test-zeus-token';
    try {
      const res = await POST(jsonRequest({
        agent: 'ZEUS',
        cycle: 'C-376',
        confidence: 0.81,
        source: 'zeus-verification',
      }) as import('next/server').NextRequest);
      assert.equal(res.status, 401);
    } finally {
      process.env.AGENT_SERVICE_TOKEN = prior;
    }
  });

  it('POST rejects invalid quorum payload shape', async () => {
    const prior = process.env.AGENT_SERVICE_TOKEN;
    process.env.AGENT_SERVICE_TOKEN = 'test-zeus-token';
    try {
      const res = await POST(jsonRequest(
        { agent: 'ZEUS', cycle: 'C-376' },
        'Bearer test-zeus-token',
      ) as import('next/server').NextRequest);
      assert.equal(res.status, 400);
      const body = (await res.json()) as { error?: string };
      assert.match(body.error ?? '', /confidence/);
    } finally {
      process.env.AGENT_SERVICE_TOKEN = prior;
    }
  });
});
