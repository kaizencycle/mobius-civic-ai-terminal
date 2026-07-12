/**
 * Cron: POST /api/epicon/promote every night at 00:30 UTC.
 *
 * Vercel crons can only fire GET requests. This GET handler internally
 * invokes the promote handler in-process (no HTTP round-trip) so auth
 * material cannot diverge between SUBSTRATE_TOKEN and CRON_SECRET.
 *
 * Auth: getEveSynthesisAuthError — allows Vercel platform cron headers
 * to bypass Bearer check (same pattern as /api/eve/cycle-synthesize).
 */
import { NextRequest, NextResponse } from 'next/server';
import { log } from '@/lib/log';
import { getEveSynthesisAuthError, normalizeServiceSecretMaterial } from '@/lib/security/serviceAuth';
import { runEpiconPromoteCron } from '@/lib/cron/runEpiconPromote';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authError = getEveSynthesisAuthError(request);
  if (authError) return authError;

  const substrateMat = normalizeServiceSecretMaterial(process.env.SUBSTRATE_TOKEN);
  const cronMat = normalizeServiceSecretMaterial(process.env.CRON_SECRET);
  const mobiusMat = normalizeServiceSecretMaterial(process.env.MOBIUS_SERVICE_SECRET);

  if (substrateMat === null && cronMat === null && mobiusMat === null) {
    console.error(
      '[cron/promote] No promote auth configured — set CRON_SECRET, MOBIUS_SERVICE_SECRET, or SUBSTRATE_TOKEN in Vercel env vars.',
    );
    return NextResponse.json({
      ok: false,
      error: 'NO_PROMOTE_AUTH_TOKEN',
      hint: 'Set CRON_SECRET, MOBIUS_SERVICE_SECRET, or SUBSTRATE_TOKEN in Vercel environment variables and redeploy',
      timestamp: new Date().toISOString(),
    });
  }

  try {
    const origin = request.nextUrl.origin;
    const { ok, status, body } = await runEpiconPromoteCron(origin, 35);

    if (!ok) {
      if (status >= 500) {
        console.warn(
          `[promote] epicon promote transient ${status} (likely Render cold-start) — heartbeat already written, will retry next cycle`,
        );
      } else if (status === 401 || status === 403) {
        console.error(
          `[promote] epicon promote returned ${status} — check CRON_SECRET / SUBSTRATE_TOKEN / MOBIUS_SERVICE_SECRET alignment`,
          typeof body === 'object' && body !== null && 'hint' in body ? { hint: (body as { hint?: string }).hint } : {},
        );
      } else {
        console.error(`[promote] epicon promote returned ${status}`);
      }
    } else {
      log.info(`[promote] epicon promote ok @ ${process.env.CURRENT_CYCLE ?? 'C-370'}`);
    }

    return NextResponse.json({
      ok,
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
