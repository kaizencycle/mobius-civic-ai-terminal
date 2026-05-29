import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveSubstrateLedgerUrl } from '@/lib/substrate/client';

describe('resolveSubstrateLedgerUrl', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    Object.assign(process.env, originalEnv);
    delete process.env.RENDER_LEDGER_URL;
    delete process.env.CIVIC_LEDGER_URL;
    delete process.env.NEXT_PUBLIC_SUBSTRATE_API_BASE;
  });

  it('rejects github.com URLs and falls back to canonical Render URL', () => {
    process.env.RENDER_LEDGER_URL = 'https://github.com/kaizencycle/mobius-civic-ai-terminal';
    const url = resolveSubstrateLedgerUrl();
    expect(url).not.toContain('github.com');
    expect(url).not.toContain('api.github.com');
  });

  it('rejects api.github.com URLs', () => {
    process.env.RENDER_LEDGER_URL = 'https://api.github.com/repos/kaizencycle';
    const url = resolveSubstrateLedgerUrl();
    expect(url).not.toContain('github.com');
  });

  it('accepts a valid Render URL', () => {
    process.env.RENDER_LEDGER_URL = 'https://civic-protocol-core-ledger.onrender.com';
    const url = resolveSubstrateLedgerUrl();
    expect(url).toBe('https://civic-protocol-core-ledger.onrender.com');
  });
});
