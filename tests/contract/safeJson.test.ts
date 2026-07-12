// C-370: safe JSON parse for HTML error pages from upstream.
// Run: tsx tests/contract/safeJson.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseResponseJson } from '../../lib/http/safeJson.ts';

describe('parseResponseJson', () => {
  it('rejects HTML with a clear error instead of SyntaxError', async () => {
    const res = new Response('<!DOCTYPE html><html><body>login</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
    const parsed = await parseResponseJson(res);
    assert.strictEqual(parsed.ok, false);
    if (!parsed.ok) {
      assert.match(parsed.error, /not JSON/i);
      assert.match(parsed.bodyPreview, /<!DOCTYPE/i);
    }
  });

  it('parses application/json bodies', async () => {
    const res = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    const parsed = await parseResponseJson<{ ok: boolean }>(res);
    assert.strictEqual(parsed.ok, true);
    if (parsed.ok) {
      assert.strictEqual(parsed.data.ok, true);
    }
  });
});
