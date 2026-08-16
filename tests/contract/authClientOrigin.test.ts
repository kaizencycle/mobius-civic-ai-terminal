// OAuth handoff URL builder — Auth.js v5 requires POST signIn, not GET signin URL.
// Run: tsx tests/contract/authClientOrigin.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOAuthHandoffUrl,
  DEFAULT_OAUTH_CALLBACK,
  sanitizeOAuthCallbackUrl,
} from '../../lib/auth/clientOrigin';

describe('buildOAuthHandoffUrl', () => {
  it('targets terminal globe with oauth handoff query', () => {
    assert.strictEqual(
      buildOAuthHandoffUrl('https://terminal.mobius-substrate.com', '/terminal/globe'),
      'https://terminal.mobius-substrate.com/terminal/globe?oauth=login&callbackUrl=%2Fterminal%2Fglobe',
    );
  });

  it('does not point at GET /api/auth/signin/github', () => {
    const url = buildOAuthHandoffUrl('https://terminal.mobius-substrate.com');
    assert.doesNotMatch(url, /\/api\/auth\/signin\//);
  });
});

describe('sanitizeOAuthCallbackUrl', () => {
  it('allows terminal chamber paths', () => {
    assert.strictEqual(sanitizeOAuthCallbackUrl('/terminal/pulse'), '/terminal/pulse');
  });

  it('rejects absolute URLs', () => {
    assert.strictEqual(
      sanitizeOAuthCallbackUrl('https://terminal.mobius-substrate.com/terminal/globe?oauth=login'),
      DEFAULT_OAUTH_CALLBACK,
    );
  });

  it('rejects callback targets that re-trigger oauth handoff', () => {
    assert.strictEqual(
      sanitizeOAuthCallbackUrl('/terminal/globe?oauth=login&callbackUrl=%2Fterminal'),
      DEFAULT_OAUTH_CALLBACK,
    );
  });

  it('strips oauth query keys from otherwise valid terminal paths', () => {
    assert.strictEqual(
      sanitizeOAuthCallbackUrl('/terminal/mic?oauth=login'),
      DEFAULT_OAUTH_CALLBACK,
    );
  });

  it('rejects paths outside /terminal', () => {
    assert.strictEqual(sanitizeOAuthCallbackUrl('/profile'), DEFAULT_OAUTH_CALLBACK);
  });
});
