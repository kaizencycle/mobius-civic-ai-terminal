// C-339 PR-C item 15: smoke tests for the REAL getAgentBearerToken().
//
// The C-333 OPT-1 path had no direct coverage — the existing resilientWrite
// test re-implemented a *mirror* of the precedence logic rather than exercising
// the function itself, so a regression in the real resolver would not be caught.
// These tests import the actual implementation.
//
// Run: tsx tests/contract/agentBearerToken.test.ts

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getAgentBearerToken } from '../../lib/substrate/agentToken.js';

const SAVED = {
  AGENT_SERVICE_TOKEN: process.env.AGENT_SERVICE_TOKEN,
  RENDER_API_KEY: process.env.RENDER_API_KEY,
  SUBSTRATE_TOKEN: process.env.SUBSTRATE_TOKEN,
};

function clear() {
  delete process.env.AGENT_SERVICE_TOKEN;
  delete process.env.RENDER_API_KEY;
  delete process.env.SUBSTRATE_TOKEN;
}

describe('getAgentBearerToken (C-333 OPT-1 outbound ledger bearer)', () => {
  beforeEach(clear);
  afterEach(() => {
    process.env.AGENT_SERVICE_TOKEN = SAVED.AGENT_SERVICE_TOKEN;
    process.env.RENDER_API_KEY = SAVED.RENDER_API_KEY;
    process.env.SUBSTRATE_TOKEN = SAVED.SUBSTRATE_TOKEN;
  });

  it('prefers AGENT_SERVICE_TOKEN (the runtime Identity JWT)', () => {
    process.env.AGENT_SERVICE_TOKEN = 'jwt-token';
    process.env.RENDER_API_KEY = 'render-key';
    assert.strictEqual(getAgentBearerToken(), 'jwt-token');
  });

  it('falls back to RENDER_API_KEY when AGENT_SERVICE_TOKEN is unset', () => {
    process.env.RENDER_API_KEY = 'render-key';
    assert.strictEqual(getAgentBearerToken(), 'render-key');
  });

  it('falls back to RENDER_API_KEY when AGENT_SERVICE_TOKEN is blank/whitespace', () => {
    process.env.AGENT_SERVICE_TOKEN = '   ';
    process.env.RENDER_API_KEY = 'render-key';
    assert.strictEqual(getAgentBearerToken(), 'render-key');
  });

  it('trims surrounding whitespace on the resolved token', () => {
    process.env.AGENT_SERVICE_TOKEN = '  jwt-token  ';
    assert.strictEqual(getAgentBearerToken(), 'jwt-token');
  });

  it('NEVER returns SUBSTRATE_TOKEN (the internal cron secret)', () => {
    process.env.SUBSTRATE_TOKEN = 'cron-secret';
    assert.strictEqual(getAgentBearerToken(), '');
  });

  it('returns empty string when nothing is configured (graceful degradation)', () => {
    assert.strictEqual(getAgentBearerToken(), '');
  });
});
