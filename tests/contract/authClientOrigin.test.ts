// OAuth handoff URL builder — Auth.js v5 requires POST signIn, not GET signin URL.
// Run: tsx tests/contract/authClientOrigin.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildOAuthHandoffUrl } from '../../lib/auth/clientOrigin';

describe('buildOAuthHandoffUrl', () => {
  it('targets terminal globe with oauth handoff query', () => {
    assert.strictEqual(
      buildOAuthHandoffUrl('https://terminal.mobius-substrate.com', '/terminal'),
      'https://terminal.mobius-substrate.com/terminal/globe?oauth=login&callbackUrl=%2Fterminal',
    );
  });

  it('does not point at GET /api/auth/signin/github', () => {
    const url = buildOAuthHandoffUrl('https://terminal.mobius-substrate.com');
    assert.doesNotMatch(url, /\/api\/auth\/signin\//);
  });
});
