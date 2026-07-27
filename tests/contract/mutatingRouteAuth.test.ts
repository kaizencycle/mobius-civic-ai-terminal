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
});
