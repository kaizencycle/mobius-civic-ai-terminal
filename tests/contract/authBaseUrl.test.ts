// OAuth base URL resolution — canon domain wins over *.vercel.app AUTH_URL.
// Run: tsx tests/contract/authBaseUrl.test.ts

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { githubOAuthCallbackUrl, resolveAuthBaseUrl } from '../../lib/auth/baseUrl';

const ENV_KEYS = ['AUTH_URL', 'NEXTAUTH_URL', 'NEXT_PUBLIC_CANONICAL_URL', 'NEXT_PUBLIC_SITE_URL'] as const;
const saved: Record<string, string | undefined> = {};

describe('resolveAuthBaseUrl', () => {
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

  it('rejects Vercel AUTH_URL in favor of canonical origin', () => {
    stashEnv();
    process.env.AUTH_URL = 'https://mobius-civic-ai-terminal.vercel.app';
    delete process.env.NEXT_PUBLIC_CANONICAL_URL;
    process.env.NEXT_PUBLIC_SITE_URL = 'https://mobius-civic-ai-terminal.vercel.app';
    assert.strictEqual(resolveAuthBaseUrl(), 'https://terminal.mobius-substrate.com');
  });

  it('keeps explicit non-Vercel AUTH_URL', () => {
    stashEnv();
    process.env.AUTH_URL = 'https://terminal.mobius-substrate.com';
    assert.strictEqual(resolveAuthBaseUrl(), 'https://terminal.mobius-substrate.com');
  });

  it('allows localhost AUTH_URL for local dev', () => {
    stashEnv();
    delete process.env.AUTH_URL;
    delete process.env.NEXT_PUBLIC_CANONICAL_URL;
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
    assert.strictEqual(resolveAuthBaseUrl(), 'http://localhost:3000');
  });

  it('builds GitHub callback URL from resolved base', () => {
    stashEnv();
    process.env.AUTH_URL = 'https://mobius-civic-ai-terminal.vercel.app';
    assert.strictEqual(
      githubOAuthCallbackUrl(),
      'https://terminal.mobius-substrate.com/api/auth/callback/github',
    );
  });
});
