// C-330: lock the rule that a server-config attestation failure never burns a
// seal's retry budget. Reproduces the live CPC error so a regression that
// reclassifies it (and re-breaks the permanent-fail behavior) fails the build.
//
// Run: tsx tests/contract/attestationErrorClass.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyAttestationError,
  isConfigClassError,
} from '../../lib/vault-v2/attestation-error-class.js';

describe('config-class errors are recognized (must not count toward retry cap)', () => {
  it('LIVE CPC 400 (IDENTITY_API_BASE unset) classifies as config', () => {
    const live = 'Error: ledger 400: {"detail":"No API base configured for terminal"}';
    assert.strictEqual(classifyAttestationError(live), 'config');
    assert.strictEqual(isConfigClassError(live), true);
  });

  it('unknown lab source classifies as config', () => {
    assert.strictEqual(classifyAttestationError('ledger 400: Unknown lab source: terminal'), 'config');
  });

  it('token verification failed (C-357 introspect 401) classifies as config', () => {
    const live =
      'ledger 401: {"detail":"Token verification failed: Client error \'401 Unauthorized\' for url \'https://mobius-identity-service.onrender.com/auth/introspect\'"}';
    assert.strictEqual(classifyAttestationError(live), 'config');
    assert.strictEqual(isConfigClassError(live), true);
  });

  it('config match is case-insensitive and survives wrapping', () => {
    assert.strictEqual(isConfigClassError('NO API BASE CONFIGURED FOR TERMINAL'), true);
    assert.strictEqual(isConfigClassError('  Error: ledger 400: {"detail":"no api base configured for terminal"} '), true);
  });
});

describe('transient errors still count toward the cap', () => {
  for (const e of [
    'ledger response not JSON (content-type: text/html)',
    'fetch failed',
    'ETIMEDOUT',
    'socket hang up',
    'ledger 503: upstream',
  ]) {
    it(`"${e.slice(0, 40)}" → transient`, () => {
      assert.strictEqual(classifyAttestationError(e), 'transient');
      assert.strictEqual(isConfigClassError(e), false);
    });
  }
});

describe('genuine/unknown failures are permanent (count toward cap)', () => {
  it('null/empty/undefined → permanent', () => {
    assert.strictEqual(classifyAttestationError(null), 'permanent');
    assert.strictEqual(classifyAttestationError(''), 'permanent');
    assert.strictEqual(classifyAttestationError(undefined), 'permanent');
  });

  it('real rejection (e.g. signature invalid) → permanent', () => {
    assert.strictEqual(classifyAttestationError('ledger 422: signature invalid'), 'permanent');
    assert.strictEqual(isConfigClassError('ledger 422: signature invalid'), false);
  });

  it('config takes precedence even when message contains "400"', () => {
    assert.strictEqual(classifyAttestationError('ledger 400: No API base configured for terminal'), 'config');
  });
});
