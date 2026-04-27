import { NextRequest, NextResponse } from 'next/server';
import { buildSubstrateCanon, type CanonFilterType } from '@/lib/substrate/canon';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const CANON_TYPES: CanonFilterType[] = [
  'epicon',
  'journal',
  'reserve_block',
  'incident',
  'rollback_plan',
  'substrate_attestation',
  'reserve_blocks',
  'substrate_attestations',
];

function clampLimit(value: string | null): number {
  const parsed = Number(value ?? '50');
  if (!Number.isFinite(parsed) || parsed <= 0) return 50;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

function isCanonType(value: string): value is CanonFilterType {
  return (CANON_TYPES as string[]).includes(value);
}

export async function GET(request: NextRequest) {
  const limit = clampLimit(request.nextUrl.searchParams.get('limit'));
  const rawType = request.nextUrl.searchParams.get('type');
  const sealId = request.nextUrl.searchParams.get('seal_id');

  if (rawType && !isCanonType(rawType)) {
    return NextResponse.json({
      ok: false,
      error: 'invalid_canon_type',
      message: `Unsupported canon type: ${rawType}`,
      allowed_types: CANON_TYPES,
    }, {
      status: 400,
      headers: {
        'Cache-Control': 'no-store',
        'X-Mobius-Source': 'substrate-canon',
      },
    });
  }

  const canon = await buildSubstrateCanon({ limit, type: rawType ?? null, seal_id: sealId });

  return NextResponse.json(canon, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Mobius-Source': 'substrate-canon',
    },
  });
}
