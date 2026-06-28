/**
 * POST /api/canon/trigger — trigger Reserve Block .dat canonization.
 * EPICON: C-357 | RESERVE_BLOCK_DAT_CANONIZATION
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { bearerMatchesToken } from '@/lib/vault-v2/auth';
import { canonizeReserveBlocks } from '@/lib/dat/canonize';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function isAuthorized(req: NextRequest): boolean {
  const token = process.env.AGENT_SERVICE_TOKEN ?? '';
  if (!token) return false;
  return bearerMatchesToken(req.headers.get('authorization'), token);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { dry_run?: boolean; skip_cpc?: boolean; incremental?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // empty body ok
  }

  const { dry_run = false, skip_cpc = false, incremental = true } = body;

  console.log('[EPICON C-357] canon/trigger', {
    dry_run,
    skip_cpc,
    incremental,
    at: new Date().toISOString(),
  });

  try {
    const result = await canonizeReserveBlocks({
      outputDir: './canon/reserve-blocks',
      dryRun: dry_run,
      skipCpcAnchors: skip_cpc,
      incremental,
      verbose: true,
    });

    return NextResponse.json({ ok: true, epicon_cycle: 'C-357', result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Use POST to trigger canonization' }, { status: 405 });
}
