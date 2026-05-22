/**
 * EPICON Ingest API Route
 *
 * GET  /api/epicon/ingest — Check ingest/promotion status
 * POST /api/epicon/ingest — Trigger the EPICON promotion pipeline on-demand
 *
 * POST requires a configured write token via one of:
 * - Authorization: Bearer <AGENT_SERVICE_TOKEN | CRON_SECRET | MOBIUS_WRITE_TOKEN>
 * - x-agent-service-token
 * - x-cron-secret
 * - x-mobius-write-token
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireWriteAuth, internalWriteAuthHeaders } from '@/lib/auth/agent-write-auth';
import { kvGet } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const lastRun = await kvGet<string>('LAST_PROMOTION_RUN_AT').catch(() => null);
  return NextResponse.json({
    agent: 'EPICON',
    status: 'operational',
    write_auth: 'required_for_post',
    last_promotion_run_at: lastRun ?? null,
  });
}

export async function POST(req: NextRequest) {
  const auth = requireWriteAuth(req);
  if (!auth.ok) {
    return NextResponse.json(
      {
        agent: 'EPICON',
        action: 'ingest',
        result: 'blocked',
        error: auth.code,
        message:
          auth.code === 'write_auth_not_configured'
            ? 'Write auth is not configured. Set AGENT_SERVICE_TOKEN, CRON_SECRET, or MOBIUS_WRITE_TOKEN.'
            : 'Write auth required for EPICON ingest POST.',
      },
      { status: auth.status },
    );
  }

  const startTime = Date.now();
  const origin = req.nextUrl.origin;
  const authHeaders = internalWriteAuthHeaders();

  try {
    const res = await fetch(new URL('/api/epicon/promote', origin), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-cron': '1',
        ...authHeaders,
      },
      body: JSON.stringify({ maxItems: 35 }),
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    });

    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;

    if (!res.ok) {
      return NextResponse.json(
        {
          agent: 'EPICON',
          action: 'ingest',
          result: 'error',
          promotion: body,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
        { status: res.status },
      );
    }

    return NextResponse.json({
      agent: 'EPICON',
      action: 'ingest',
      result: 'ok',
      promotion: body,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        agent: 'EPICON',
        action: 'ingest',
        result: 'error',
        message: error instanceof Error ? error.message : 'EPICON ingest failed',
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
