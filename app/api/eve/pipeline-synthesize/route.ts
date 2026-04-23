/**
 * POST /api/eve/pipeline-synthesize — compatibility alias to cycle synthesis.
 *
 * External automations historically targeted this endpoint. To keep those runs
 * healthy and avoid long-running model pipeline hangs, this route now forwards
 * directly to `/api/eve/cycle-synthesize`.
 *
 * Bearer: MOBIUS_SERVICE_SECRET | CRON_SECRET | BACKFILL_SECRET
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getEveSynthesisAuthError } from '@/lib/security/serviceAuth';

export const dynamic = 'force-dynamic';

function serverBaseUrl(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  if (host) return `${proto}://${host}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://127.0.0.1:3000';
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    ok: true,
    info: 'Compatibility alias: forwards to /api/eve/cycle-synthesize',
    canonicalRoute: '/api/eve/cycle-synthesize',
  });
}

export async function POST(request: NextRequest) {
  const authErr = getEveSynthesisAuthError(request);
  if (authErr) return authErr;

  const base = serverBaseUrl(request);
  const forwardHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const authorization = request.headers.get('authorization');
  if (authorization) {
    forwardHeaders.Authorization = authorization;
  }
  const bodyText = await request.text();

  const cycleRes = await fetch(`${base}/api/eve/cycle-synthesize`, {
    method: 'POST',
    headers: forwardHeaders,
    body: bodyText.trim() ? bodyText : '{}',
    cache: 'no-store',
  });
  const cycleJson = await readJson(cycleRes);

  return NextResponse.json(cycleJson, { status: cycleRes.status });
}
