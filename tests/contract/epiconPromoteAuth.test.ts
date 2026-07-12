// C-370: EPICON promote auth — CRON_SECRET preferred over stale SUBSTRATE_TOKEN.
// Run: tsx tests/contract/epiconPromoteAuth.test.ts

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import {
  epiconPromoteAuthorizationHeader,
  getEpiconPromoteAuthError,
} from '../../lib/security/epiconPromoteAuth.ts';

const SAVED = {
  CRON_SECRET: process.env.CRON_SECRET,
  SUBSTRATE_TOKEN: process.env.SUBSTRATE_TOKEN,
  MOBIUS_SERVICE_SECRET: process.env.MOBIUS_SERVICE_SECRET,
  VERCEL: process.env.VERCEL,
};

function req(auth?: string): NextRequest {
  const headers = new Headers();
  if (auth) headers.set('authorization', auth);
  return new NextRequest('https://example.com/api/epicon/promote', {
    method: 'POST',
    headers,
  });
}

describe('epiconPromoteAuth', () => {
  beforeEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.SUBSTRATE_TOKEN;
    delete process.env.MOBIUS_SERVICE_SECRET;
    delete process.env.VERCEL;
  });

  afterEach(() => {
    process.env.CRON_SECRET = SAVED.CRON_SECRET;
    process.env.SUBSTRATE_TOKEN = SAVED.SUBSTRATE_TOKEN;
    process.env.MOBIUS_SERVICE_SECRET = SAVED.MOBIUS_SERVICE_SECRET;
    process.env.VERCEL = SAVED.VERCEL;
  });

  it('accepts CRON_SECRET bearer', () => {
    process.env.CRON_SECRET = 'cron-good';
    assert.strictEqual(getEpiconPromoteAuthError(req('Bearer cron-good')), null);
  });

  it('accepts SUBSTRATE_TOKEN when CRON_SECRET unset', () => {
    process.env.SUBSTRATE_TOKEN = 'substrate-good';
    assert.strictEqual(getEpiconPromoteAuthError(req('Bearer substrate-good')), null);
  });

  it('rejects bearer that matches neither CRON_SECRET nor SUBSTRATE_TOKEN', () => {
    process.env.CRON_SECRET = 'cron-good';
    process.env.SUBSTRATE_TOKEN = 'substrate-good';
    const err = getEpiconPromoteAuthError(req('Bearer wrong-token'));
    assert.ok(err);
    assert.strictEqual(err?.status, 401);
  });

  it('epiconPromoteAuthorizationHeader prefers CRON_SECRET over SUBSTRATE_TOKEN', () => {
    process.env.CRON_SECRET = 'cron-good';
    process.env.SUBSTRATE_TOKEN = 'substrate-stale';
    assert.strictEqual(epiconPromoteAuthorizationHeader(), 'Bearer cron-good');
  });
});
