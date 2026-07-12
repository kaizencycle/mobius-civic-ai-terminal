/**
 * GET /api/cron/reserve-canon-integrity — hot/cold gap + block_number collision audit.
 * EPICON: C-370 item 6
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { fetchReserveCanonIntegrity } from '@/lib/dat/reserveCanonIntegrity';
import { resolveExportCycle } from '@/lib/dat/resolveExportCycle';
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

  try {
    const integrity = await fetchReserveCanonIntegrity();
    const operatorCycle = resolveExportCycle();

    return NextResponse.json(
      {
        ok: integrity.integrity_ok,
        epicon_cycle: operatorCycle,
        integrity,
        message: integrity.integrity_ok
          ? 'Reserve canon integrity OK'
          : `Integrity issues: ${integrity.issues.join(', ')}`,
      },
      { status: integrity.integrity_ok ? 200 : 409 },
    );
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
