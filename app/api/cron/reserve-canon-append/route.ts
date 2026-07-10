/**
 * POST /api/cron/reserve-canon-append — detect hot/cold canon gap and dispatch export.
 * EPICON: C-368 PR7 | RESERVE_BLOCK_DAT_CANONIZATION
 *
 * Phase C: cycle-close lane. Never let hot KV and cold Substrate diverge silently.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { dispatchCanonExportWorkflow } from '@/lib/dat/dispatchCanonExport';
import { fetchCanonGap } from '@/lib/dat/substrateCanonGap';
import { bearerMatchesToken } from '@/lib/vault-v2/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronHeader = request.headers.get('x-vercel-cron');
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET ?? '';
  const manuallyAuthed = bearerMatchesToken(authHeader, cronSecret);

  if (!cronHeader && !manuallyAuthed) {
    return NextResponse.json({ ok: false, error: 'Cron-only endpoint' }, { status: 403 });
  }

  const force = request.nextUrl.searchParams.get('force') === 'true';
  const dryRun = request.nextUrl.searchParams.get('dry_run') === 'true';

  try {
    const gap = await fetchCanonGap();

    if (gap.gap === 0 && !force) {
      return NextResponse.json({
        ok: true,
        action: 'noop',
        epicon_cycle: 'C-368',
        gap,
        message: 'Hot and cold canon are aligned — no export dispatched',
      });
    }

    const incremental = gap.manifest_present && gap.canonized_cold > 0;
    const dispatch = await dispatchCanonExportWorkflow({
      incremental,
      dryRun,
      openSubstratePr: !dryRun,
    });

    if (!dispatch.ok) {
      return NextResponse.json(
        {
          ok: false,
          action: 'dispatch_failed',
          epicon_cycle: 'C-368',
          gap,
          error: dispatch.error,
          hint: 'Configure SUBSTRATE_GITHUB_TOKEN or GITHUB_TOKEN with workflow scope on Vercel',
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      action: dryRun ? 'dry_run_dispatched' : 'export_dispatched',
      epicon_cycle: 'C-368',
      gap,
      incremental,
      workflow: 'reserve-block-canon-export.yml',
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
