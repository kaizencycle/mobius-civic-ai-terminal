import { NextRequest, NextResponse } from 'next/server';
import { buildSubstrateCanon, type CanonFilterType } from '@/lib/substrate/canon';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function clampLimit(value: string | null): number {
  const parsed = Number(value ?? '50');
  if (!Number.isFinite(parsed) || parsed <= 0) return 50;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

function validateType(value: string | null): CanonFilterType | null {
  if (!value) return null;
  const allowed: CanonFilterType[] = [
    'epicon',
    'journal',
    'reserve_block',
    'incident',
    'rollback_plan',
    'substrate_attestation',
    'reserve_blocks',
    'substrate_attestations',
  ];
  return (allowed as string[]).includes(value) ? (value as CanonFilterType) : null;
}

export async function GET(request: NextRequest) {
  const limit = clampLimit(request.nextUrl.searchParams.get('limit'));
  const type = validateType(request.nextUrl.searchParams.get('type'));
  const sealId = request.nextUrl.searchParams.get('seal_id');

  const canon = await buildSubstrateCanon({ limit, type, seal_id: sealId });

  return NextResponse.json(canon, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Mobius-Source': 'substrate-canon',
    },
  });
}
