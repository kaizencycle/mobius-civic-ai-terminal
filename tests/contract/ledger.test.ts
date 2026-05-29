import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSubstrateLedgerUrl } from '../../lib/substrate/client.js';

describe('resolveSubstrateLedgerUrl', () => {
  after(() => {
    delete process.env.RENDER_LEDGER_URL;
    delete process.env.CIVIC_LEDGER_URL;
    delete process.env.NEXT_PUBLIC_SUBSTRATE_API_BASE;
  });

  it('rejects github.com URLs and falls back to canonical Render URL', () => {
    process.env.RENDER_LEDGER_URL = 'https://github.com/kaizencycle/mobius-civic-ai-terminal';
    const url = resolveSubstrateLedgerUrl();
    assert.ok(!url.includes('github.com'), `Expected no github.com in URL, got: ${url}`);
  });

  it('rejects api.github.com URLs', () => {
    process.env.RENDER_LEDGER_URL = 'https://api.github.com/repos/kaizencycle';
    const url = resolveSubstrateLedgerUrl();
    assert.ok(!url.includes('github.com'), `Expected no github.com in URL, got: ${url}`);
  });

  it('accepts a valid Render URL', () => {
    process.env.RENDER_LEDGER_URL = 'https://civic-protocol-core-ledger.onrender.com';
    const url = resolveSubstrateLedgerUrl();
    assert.strictEqual(url, 'https://civic-protocol-core-ledger.onrender.com');
  });
});
