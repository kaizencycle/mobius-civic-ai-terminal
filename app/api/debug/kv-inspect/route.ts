/**
 * GET /api/debug/kv-inspect — operator-only KV key samples (Upstash).
 *
 * Query: pattern (Redis KEYS pattern, default *), limit (1–50, default 15)
 * Auth: same service secrets as other automation routes, or Vercel Cron headers.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getEveSynthesisAuthError } from '@/lib/security/serviceAuth';
import { kvInspectSamples } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';

const EXPECTED_KEY_HINTS = [
  'mobius:epicon:feed',
  'epicon:feed',
  'mobius:gi:latest',
  'mobius:echo:state',
  'mobius:echo:kv:heartbeat',
  'mobius:heartbeat:last',
  'mobius:journal:*',
  'journal:*',
] as const;

export async function GET(request: NextRequest) {
  const authErr = getEveSynthesisAuthError(request);
  if (authErr) return authErr;

  const pattern = request.nextUrl.searchParams.get('pattern')?.trim() || '*';
  const limitRaw = request.nextUrl.searchParams.get('limit');
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 15;

  const result = await kvInspectSamples(pattern, Number.isFinite(limit) ? limit : 15);

  return NextResponse.json(
    {
      ok: result.ok,
      error: result.error,
      pattern,
      totalMatched: result.totalMatched,
      samplesReturned: result.keys.length,
      keys: result.keys,
      expectedKeyHints: EXPECTED_KEY_HINTS,
      note:
        'Keys are raw Redis names. Mobius kvSet uses mobius: prefix; some writers use unprefixed lists (e.g. epicon:feed).',
      timestamp: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store', 'X-Mobius-Source': 'debug-kv-inspect' } },
  );
}
