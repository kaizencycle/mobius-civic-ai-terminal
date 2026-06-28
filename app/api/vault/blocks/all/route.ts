/**
 * GET /api/vault/blocks/all — paginated sealed blocks for canonization runners.
 * EPICON: C-357 | RESERVE_BLOCK_DAT_CANONIZATION
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { bearerMatchesToken } from '@/lib/vault-v2/auth';
import { fetchSealedSealsForApi } from '@/lib/vault/fetchAllSealedBlocks';
import { sealToVaultBlock } from '@/lib/dat/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function isAuthorized(req: NextRequest): boolean {
  const service = process.env.AGENT_SERVICE_TOKEN ?? '';
  const cron = process.env.CRON_SECRET ?? '';
  const mobius = process.env.MOBIUS_SERVICE_SECRET ?? '';
  if (!service && !cron && !mobius) return true;
  return (
    bearerMatchesToken(req.headers.get('authorization'), service) ||
    bearerMatchesToken(req.headers.get('authorization'), cron) ||
    bearerMatchesToken(req.headers.get('authorization'), mobius)
  );
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = req.nextUrl;
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? '50')));
  const from = Math.max(1, Number(url.searchParams.get('from') ?? '1'));
  const to = Math.max(from, Number(url.searchParams.get('to') ?? '10000'));
  const offset = (page - 1) * limit;

  const { seals, total } = await fetchSealedSealsForApi(from, to, limit, offset);
  const blocks = seals.map(sealToVaultBlock);

  return NextResponse.json({
    ok: true,
    blocks,
    page,
    limit,
    total,
    has_more: offset + blocks.length < total,
  });
}
