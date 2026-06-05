// C-333: a substrate failure must NOT lose the journal write or 502 the route.
// Locks the cascade fix: KV-first, substrate best-effort, honest canonical flag.
//
// Run: tsx tests/contract/resilientWrite.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decideWriteResult } from '../../lib/substrate/resilientWrite.js';

describe('resilient write: substrate failure no longer takes down journaling', () => {
  it('LIVE C-333: KV ok + substrate 401 → 200, accepted, pending immortalization', () => {
    const r = decideWriteResult(
      { ok: true },
      { ok: false, error: 'ledger 401: Token verification failed' },
      'journal-ATLAS-C-333-x',
    );
    assert.strictEqual(r.status, 200); // was 502 — the cascade bug
    assert.strictEqual(r.body.ok, true); // write SURVIVES
    assert.strictEqual(r.body.mirrored_to_kv, true); // KV not skipped
    assert.strictEqual(r.body.canonical, false); // honest: not immortalized
    assert.strictEqual(r.body.pending_immortalization, true); // reattest will retry
    assert.match(r.body.substrate_error ?? '', /401/);
  });

  it('both layers ok → 200, canonical true', () => {
    const r = decideWriteResult({ ok: true }, { ok: true, entryId: 'e1' }, 'e1');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.canonical, true);
    assert.strictEqual(r.body.mirrored_to_kv, true);
    assert.strictEqual(r.body.pending_immortalization, undefined);
  });

  it('BOTH layers fail → 502 (real error, nothing persisted, surfaced loudly)', () => {
    const r = decideWriteResult(
      { ok: false, error: 'kv down' },
      { ok: false, error: 'ledger 500' },
    );
    assert.strictEqual(r.status, 502);
    assert.strictEqual(r.body.ok, false);
    assert.strictEqual(r.body.mirrored_to_kv, false);
    assert.match(r.body.kv_error ?? '', /kv down/);
  });

  it('substrate ok but KV mirror lagged → still canonical success (record landed)', () => {
    const r = decideWriteResult({ ok: false, error: 'kv timeout' }, { ok: true }, 'e2');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.canonical, true);
    assert.strictEqual(r.body.mirrored_to_kv, false);
    assert.match(r.body.kv_error ?? '', /kv timeout/);
  });
});

// OPT-1: token resolver must never prefer the internal cron secret for the
// outbound ledger call. We assert the documented precedence of getAgentBearerToken
// by simulating its logic (AGENT_SERVICE_TOKEN first, RENDER_API_KEY fallback,
// SUBSTRATE_TOKEN never).
describe('token resolver precedence (OPT-1)', () => {
  function resolve(env: Record<string, string | undefined>): string {
    // mirror of getAgentBearerToken — SUBSTRATE_TOKEN must NOT appear here
    const primary = (env.AGENT_SERVICE_TOKEN ?? '').trim();
    if (primary.length > 0) return primary;
    return (env.RENDER_API_KEY ?? '').trim();
  }
  it('prefers AGENT_SERVICE_TOKEN (the Identity JWT)', () => {
    assert.strictEqual(resolve({ AGENT_SERVICE_TOKEN: 'jwt', SUBSTRATE_TOKEN: 'cron' }), 'jwt');
  });
  it('NEVER returns SUBSTRATE_TOKEN (the internal cron secret)', () => {
    assert.strictEqual(resolve({ SUBSTRATE_TOKEN: 'cron' }), '');
  });
  it('falls back to RENDER_API_KEY when no JWT set', () => {
    assert.strictEqual(resolve({ RENDER_API_KEY: 'rk' }), 'rk');
  });
});
