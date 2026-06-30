// C-358: Identity attest auth probe — configured vs login_ok distinction.
// Run: pnpm exec tsx tests/contract/identityAttestProbe.test.ts

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { probeIdentityAttestAuth } from '../../lib/substrate/identityToken';

const ENV_KEYS = ['IDENTITY_SERVICE_EMAIL', 'IDENTITY_SERVICE_PASSWORD'] as const;
const saved: Record<string, string | undefined> = {};

describe('probeIdentityAttestAuth', () => {
  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('reports not configured when creds absent', async () => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    const probe = await probeIdentityAttestAuth();
    assert.strictEqual(probe.configured, false);
    assert.strictEqual(probe.login_ok, false);
    assert.match(probe.diagnosis, /unset/i);
  });
});
