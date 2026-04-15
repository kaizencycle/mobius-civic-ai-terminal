/**
 * Cron: POST /api/epicon/promote every night at 00:30 UTC.
 *
 * Vercel crons can only fire GET requests. This GET handler internally
 * fans out to POST /api/epicon/promote with { maxItems: 5 } so the
 * promotion engine runs on a schedule without requiring manual trigger.
 *
 * Auth: getEveSynthesisAuthError — allows Vercel platform cron headers
 * to bypass Bearer check (same pattern as /api/eve/cycle-synthesize).
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
    const res = await fetch(new URL('/api/epicon/promote', origin), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify({ maxItems: 35 }),
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    });

    const body = await res.json().catch(() => null);

    return NextResponse.json({
      ok: res.ok,
      promotion: body,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Promotion cron failed',
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
