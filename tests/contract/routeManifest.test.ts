// C-339 PR-C item 11/12 (Codex review fix): the route-manifest method detector
// must recognize re-exported handlers, not just direct function/const exports.
// Two live routes use re-export forms — if the detector misses them the
// CI-enforced manifest is stale-by-construction for part of the surface.
//
// Run: tsx tests/contract/routeManifest.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectMethods } from '../../scripts/gen-route-manifest.mjs';

describe('route manifest: method detection', () => {
  it('direct function handlers', () => {
    assert.deepStrictEqual(detectMethods('export async function GET() {}\nexport function POST() {}'), ['GET', 'POST']);
  });

  it('const-assigned handlers', () => {
    assert.deepStrictEqual(detectMethods('export const GET = () => {};\nexport const PUT: Handler = h;'), ['GET', 'PUT']);
  });

  it('destructured re-export (next-auth): export const { GET, POST } = handlers', () => {
    assert.deepStrictEqual(detectMethods("import { handlers } from '@/auth';\nexport const { GET, POST } = handlers;"), ['GET', 'POST']);
  });

  it('aliased re-export: export { handler as GET, handler as POST, handler as DELETE }', () => {
    assert.deepStrictEqual(
      detectMethods('export { handler as GET, handler as POST, handler as DELETE };'),
      ['GET', 'POST', 'DELETE'],
    );
  });

  it('direct named re-export: export { GET }', () => {
    assert.deepStrictEqual(detectMethods('export { GET };'), ['GET']);
  });

  it('does not count non-method exports or method-named locals aliased away', () => {
    assert.deepStrictEqual(detectMethods("export const dynamic = 'force-dynamic';\nexport { foo as bar };"), []);
  });

  it('deduplicates and orders by HTTP method order', () => {
    assert.deepStrictEqual(
      detectMethods('export function POST() {}\nexport { handler as GET };'),
      ['GET', 'POST'],
    );
  });
});
