// C-384 PR-5: mutating API routes must enforce auth per mutating-route-manifest.
// Run: tsx tests/contract/mutatingRouteAuth.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MUTATING_ROUTE_AUTH_CONTRACT,
  postHandlerMatchesAuthContract,
} from '../../lib/security/mutating-route-manifest.ts';
import { getCronMutatingRouteAuthError } from '../../lib/security/mutatingRouteAuth.ts';
import { NextRequest } from 'next/server';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function readRepoFile(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

describe('mutating route auth (C-384 PR-5)', () => {
  for (const entry of MUTATING_ROUTE_AUTH_CONTRACT) {
    it(`${entry.file} POST uses ${entry.auth} auth guard`, () => {
      const src = readRepoFile(entry.file);
      assert.ok(
        postHandlerMatchesAuthContract(src, entry.auth),
        `POST handler in ${entry.file} must call get*MutatingRouteAuthError (${entry.auth})`,
      );
    });
  }

  it('cycle-advance POST does not run without auth helper', () => {
    const src = readRepoFile('app/api/eve/cycle-advance/route.ts');
    assert.match(src, /getCronMutatingRouteAuthError\(request\)/);
  });

  it('cron mutating auth rejects spoofed vercel cron markers without secret', () => {
    const prevCron = process.env.CRON_SECRET;
    const prevVercel = process.env.VERCEL;
    process.env.CRON_SECRET = 'contract-cron-secret-638';
    process.env.VERCEL = '1';
    try {
      const req = new NextRequest('http://localhost/api/eve/cycle-advance', {
        method: 'POST',
        headers: {
          'x-vercel-cron-auth-token': 'spoofed-by-client',
          'user-agent': 'vercel-cron/1.0',
          'x-vercel-cron': '1',
        },
      });
      const err = getCronMutatingRouteAuthError(req);
      assert.ok(err !== null);
      assert.equal(err.status, 401);
    } finally {
      if (prevCron === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prevCron;
      if (prevVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = prevVercel;
    }
  });

  it('cron mutating auth accepts CRON_SECRET bearer', () => {
    const prevCron = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'contract-cron-secret-638';
    try {
      const req = new NextRequest('http://localhost/api/eve/cycle-advance', {
        method: 'POST',
        headers: { authorization: 'Bearer contract-cron-secret-638' },
      });
      assert.equal(getCronMutatingRouteAuthError(req), null);
    } finally {
      if (prevCron === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prevCron;
    }
  });

  it('mutatingRouteAuth cron lane uses secret-only service auth', () => {
    const src = readRepoFile('lib/security/mutatingRouteAuth.ts');
    assert.match(src, /getCronMutatingRouteAuthError[\s\S]*?return getServiceAuthError\(request\)/);
    assert.doesNotMatch(src, /return getEveSynthesisAuthError/);
  });

  it('operator mutating auth uses getOperatorSession parity with journal canonize', () => {
    const src = readRepoFile('lib/security/mutatingRouteAuth.ts');
    assert.match(src, /getOperatorSession/);
    assert.doesNotMatch(src, /\bauth\(\)/);
  });
});
