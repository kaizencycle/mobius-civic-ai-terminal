/**
 * Cron: POST /api/echo/ingest every 2 hours.
 *
 * Vercel crons fire GET requests only. This GET handler fans out to
 * POST /api/echo/ingest so the ECHO ingest cycle runs on a schedule
 * and ECHO_STATE stays fresh in KV (30-min TTL extended to 2h via this cron).
 *
 * Auth: getEveSynthesisAuthError — allows Vercel platform cron headers
 * to bypass Bearer check.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getEveSynthesisAuthError, serviceAuthorizationHeaderValue } from '@/lib/security/serviceAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authError = getEveSynthesisAuthError(request);
  if (authError) return authError;

  const origin = request.nextUrl.origin;
  const authHeader = serviceAuthorizationHeaderValue();

  try {
    const res = await fetch(new URL('/api/echo/ingest', origin), {
      method: 'POST',
      headers: {
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(55_000),
    });

    const body = await res.json().catch(() => null);

    return NextResponse.json({
      ok: res.ok,
      ingest: body,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Echo ingest cron failed',
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
