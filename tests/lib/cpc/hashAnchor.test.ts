import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCpcBaseUrl } from '../../../lib/cpc/hashAnchor.js';

describe('resolveCpcBaseUrl', () => {
  const keys = [
    'CPC_BASE_URL',
    'RENDER_LEDGER_URL',
    'CIVIC_LEDGER_URL',
    'NEXT_PUBLIC_CIVIC_LEDGER_URL',
  ] as const;

  const saved: Record<string, string | undefined> = {};

  after(() => {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  function clearEnv(): void {
    for (const key of keys) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  }

  it('prefers CPC_BASE_URL host root', () => {
    clearEnv();
    process.env.CPC_BASE_URL = 'https://civic-protocol-core-ledger.onrender.com/';
    assert.strictEqual(
      resolveCpcBaseUrl(),
      'https://civic-protocol-core-ledger.onrender.com',
    );
  });

  it('strips /api paths from CIVIC_LEDGER_URL attest endpoint', () => {
    clearEnv();
    process.env.CIVIC_LEDGER_URL =
      'https://civic-protocol-core-ledger.onrender.com/api/ledger/attest';
    assert.strictEqual(
      resolveCpcBaseUrl(),
      'https://civic-protocol-core-ledger.onrender.com',
    );
  });

  it('uses RENDER_LEDGER_URL before CIVIC_LEDGER_URL', () => {
    clearEnv();
    process.env.RENDER_LEDGER_URL = 'https://civic-protocol-core-ledger.onrender.com';
    process.env.CIVIC_LEDGER_URL =
      'https://civic-protocol-core-ledger.onrender.com/api/ledger/attest';
    assert.strictEqual(
      resolveCpcBaseUrl(),
      'https://civic-protocol-core-ledger.onrender.com',
    );
  });
});
