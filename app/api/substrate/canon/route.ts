import { NextRequest, NextResponse } from 'next/server';
import { buildSubstrateCanon } from '@/lib/substrate/canon';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function clampLimit(value: string | null): number {
  const parsed = Number(value ?? '50');
  if (!Number.isFinite(parsed) || parsed <= 0) return 50;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

export async function GET(request: NextRequest) {
  const limit = clampLimit(request.nextUrl.searchParams.get('limit'));
  const type = request.nextUrl.searchParams.get('type');
  const sealId = request.nextUrl.searchParams.get('seal_id');

  const canon = await buildSubstrateCanon({ limit, type: type as any, seal_id: sealId });

  return NextResponse.json(canon, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Mobius-Source': 'substrate-canon',
    },
  });
}
