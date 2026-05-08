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
import { kvSet } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authError = getEveSynthesisAuthError(request);
  if (authError) return authError;

  const origin = request.nextUrl.origin;
  const authHeader = serviceAuthorizationHeaderValue();

  try {
    // FIX-507-02: write heartbeat unconditionally so promotion-status never shows stale
    // when the promote fetch times out or returns a transient non-OK (Render cold-start).
    await kvSet('LAST_PROMOTION_RUN_AT', new Date().toISOString(), 7 * 24 * 3600).catch(() => {});

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
    if (!res.ok) {
      console.warn('[promote] /api/epicon/promote returned', res.status, '— heartbeat still written');
    }

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
