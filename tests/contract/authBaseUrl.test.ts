// OAuth base URL resolution — canon domain wins over *.vercel.app AUTH_URL.
// Run: tsx tests/contract/authBaseUrl.test.ts

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  githubOAuthCallbackUrl,
  resolveAuthAliasRedirectUrl,
  resolveAuthBaseUrl,
  shouldRedirectAuthAliasNavigation,
} from '../../lib/auth/baseUrl';

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

  it('allows localhost when canonical URL is set (.env.example pattern)', () => {
    stashEnv();
    delete process.env.AUTH_URL;
    process.env.NEXT_PUBLIC_CANONICAL_URL = 'https://terminal.mobius-substrate.com';
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
    assert.strictEqual(resolveAuthBaseUrl(), 'http://localhost:3000');
  });

  it('allows localhost AUTH_URL for local dev when canonical unset', () => {
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

describe('resolveAuthAliasRedirectUrl', () => {
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

  it('redirects vercel.app auth routes to canonical origin', () => {
    stashEnv();
    delete process.env.AUTH_URL;
    process.env.NEXT_PUBLIC_CANONICAL_URL = 'https://terminal.mobius-substrate.com';
    const request = new URL(
      'https://mobius-civic-ai-terminal.vercel.app/api/auth/signin/github?callbackUrl=%2Fterminal',
    );
    const redirect = resolveAuthAliasRedirectUrl(request);
    assert.ok(redirect);
    assert.strictEqual(
      redirect!.href,
      'https://terminal.mobius-substrate.com/api/auth/signin/github?callbackUrl=%2Fterminal',
    );
  });

  it('does not redirect when already on canonical host', () => {
    stashEnv();
    process.env.AUTH_URL = 'https://terminal.mobius-substrate.com';
    const request = new URL('https://terminal.mobius-substrate.com/api/auth/signin/github');
    assert.strictEqual(resolveAuthAliasRedirectUrl(request), null);
  });

  it('does not redirect localhost auth routes', () => {
    stashEnv();
    delete process.env.AUTH_URL;
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000';
    const request = new URL('http://localhost:3000/api/auth/signin/github');
    assert.strictEqual(resolveAuthAliasRedirectUrl(request), null);
  });
});

describe('shouldRedirectAuthAliasNavigation', () => {
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

  const navigateHeaders = {
    get(name: string) {
      if (name === 'sec-fetch-mode') return 'navigate';
      if (name === 'accept') return 'text/html';
      return null;
    },
  };

  const fetchHeaders = {
    get(name: string) {
      if (name === 'sec-fetch-mode') return 'cors';
      if (name === 'accept') return 'application/json';
      return null;
    },
  };

  it('redirects navigations to OAuth sign-in on vercel.app', () => {
    stashEnv();
    process.env.NEXT_PUBLIC_CANONICAL_URL = 'https://terminal.mobius-substrate.com';
    const request = new URL(
      'https://mobius-civic-ai-terminal.vercel.app/api/auth/signin/github?callbackUrl=%2Fterminal',
    );
    const redirect = shouldRedirectAuthAliasNavigation(request, navigateHeaders, 'GET');
    assert.ok(redirect);
    assert.strictEqual(
      redirect!.href,
      'https://terminal.mobius-substrate.com/api/auth/signin/github?callbackUrl=%2Fterminal',
    );
  });

  it('does not redirect Auth.js client fetch to csrf on vercel.app', () => {
    stashEnv();
    process.env.NEXT_PUBLIC_CANONICAL_URL = 'https://terminal.mobius-substrate.com';
    const request = new URL('https://mobius-civic-ai-terminal.vercel.app/api/auth/csrf');
    assert.strictEqual(shouldRedirectAuthAliasNavigation(request, fetchHeaders, 'GET'), null);
  });

  it('does not redirect Auth.js client fetch to session on vercel.app', () => {
    stashEnv();
    process.env.NEXT_PUBLIC_CANONICAL_URL = 'https://terminal.mobius-substrate.com';
    const request = new URL('https://mobius-civic-ai-terminal.vercel.app/api/auth/session');
    assert.strictEqual(shouldRedirectAuthAliasNavigation(request, fetchHeaders, 'GET'), null);
  });
});
