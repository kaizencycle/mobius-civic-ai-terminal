// C-358: Canonical origin resolution — CANONICAL_URL wins; Vercel SITE_URL rejected.
// Run: tsx tests/contract/canonicalUrl.test.ts

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCanonicalTerminalOrigin } from '../../lib/site/canonicalUrl';

const ENV_KEYS = ['NEXT_PUBLIC_CANONICAL_URL', 'NEXT_PUBLIC_SITE_URL'] as const;
const saved: Record<string, string | undefined> = {};

describe('resolveCanonicalTerminalOrigin', () => {
  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  function stashEnv(): void {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
    }
  }

  it('prefers NEXT_PUBLIC_CANONICAL_URL over NEXT_PUBLIC_SITE_URL', () => {
    stashEnv();
    process.env.NEXT_PUBLIC_CANONICAL_URL = 'https://terminal.mobius-substrate.com';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://mobius-civic-ai-terminal.vercel.app';
    assert.strictEqual(
      resolveCanonicalTerminalOrigin(),
      'https://terminal.mobius-substrate.com',
    );
  });

  it('rejects Vercel SITE_URL when canonical var is unset', () => {
    stashEnv();
    delete process.env.NEXT_PUBLIC_CANONICAL_URL;
    process.env.NEXT_PUBLIC_SITE_URL = 'https://mobius-civic-ai-terminal.vercel.app';
    assert.strictEqual(
      resolveCanonicalTerminalOrigin(),
      'https://terminal.mobius-substrate.com',
    );
  });

  it('allows non-Vercel SITE_URL for local dev', () => {
    stashEnv();
    delete process.env.NEXT_PUBLIC_CANONICAL_URL;
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
    assert.strictEqual(resolveCanonicalTerminalOrigin(), 'http://localhost:3000');
  });
});
