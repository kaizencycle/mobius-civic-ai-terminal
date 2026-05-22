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
import { getEveSynthesisAuthError, serviceAuthorizationHeaderValue, normalizeServiceSecretMaterial } from '@/lib/security/serviceAuth';
import { kvSet, kvGet } from '@/lib/kv/store';

const PROMOTE_FAIL_KEY = 'watchdog:promote-fail-count';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authError = getEveSynthesisAuthError(request);
  if (authError) return authError;

  // C-319: fast-fail when SUBSTRATE_TOKEN is absent. Falling back to CRON_SECRET causes
  // 401s on every run (the promote endpoint requires SUBSTRATE_TOKEN specifically), which
  // silently increments the watchdog counter without surfacing a clear root cause.
  const substrateTokenRaw = normalizeServiceSecretMaterial(process.env.SUBSTRATE_TOKEN);
  if (substrateTokenRaw === null) {
    console.error('[cron/promote] SUBSTRATE_TOKEN not configured — skipping promote run. Set in Vercel env vars.');
    return NextResponse.json({
      ok: false,
      error: 'SUBSTRATE_TOKEN_MISSING',
      hint: 'Set SUBSTRATE_TOKEN in Vercel environment variables and redeploy',
      timestamp: new Date().toISOString(),
    });
  }

  const origin = request.nextUrl.origin;
  // C-314 T-03: /api/epicon/promote compares normalized SUBSTRATE_TOKEN / CRON_SECRET material
  // (see normalizeServiceSecretMaterial) so env may include optional Bearer prefix or quotes.
  const substrateMat = substrateTokenRaw;
  const cronMat = normalizeServiceSecretMaterial(process.env.CRON_SECRET);
  const authHeader =
    substrateMat !== null
      ? `Bearer ${substrateMat}`
      : cronMat !== null
        ? `Bearer ${cronMat}`
        : serviceAuthorizationHeaderValue();

  if (!authHeader) {
    console.warn(
      '[promote] skipped: no SUBSTRATE_TOKEN, CRON_SECRET, or outbound service bearer — configure env to run scheduled promotion',
    );
    return NextResponse.json({
      ok: false,
      skipped: true,
      reason: 'no_promote_auth_material',
      timestamp: new Date().toISOString(),
    });
  }

  try {
    // FIX-507-02: write heartbeat unconditionally so promotion-status never shows stale
    // when the promote fetch times out or returns a transient non-OK (Render cold-start).
    await kvSet('LAST_PROMOTION_RUN_AT', new Date().toISOString(), 7 * 24 * 3600).catch(() => {});

    const res = await fetch(new URL('/api/epicon/promote', origin), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-cron': '1',
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify({ maxItems: 35 }),
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    });

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      console.error(`[promote] /api/epicon/promote returned ${res.status} — check SUBSTRATE_TOKEN env var`);
      if (res.status === 401) {
        const token = authHeader ?? '';
        const prefix = token.replace(/^Bearer /, '').slice(0, 6);
        console.error(`[promote] 401 received — auth token prefix: ${prefix || '(none)'}***`);
        const failCount = ((await kvGet<number>(PROMOTE_FAIL_KEY)) ?? 0) + 1;
        await kvSet(PROMOTE_FAIL_KEY, failCount, 86400).catch(() => {});
      }
    } else {
      console.log(`[promote] epicon promote ok @ ${process.env.CURRENT_CYCLE ?? 'C-305'}`);
      await kvSet(PROMOTE_FAIL_KEY, 0, 86400).catch(() => {});
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
