import { NextRequest, NextResponse } from 'next/server';
import { getSeal } from '@/lib/vault-v2/store';
import { historicalAttestationDigest, listHistoricalBackfillCandidates } from '@/lib/vault-v2/historical-attestation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function clampLimit(value: string | null): number {
  const parsed = Number(value ?? '25');
  if (!Number.isFinite(parsed) || parsed <= 0) return 25;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

export async function GET(request: NextRequest) {
  const sealId = request.nextUrl.searchParams.get('seal_id');
  if (sealId) {
    const seal = await getSeal(sealId);
    if (!seal) return NextResponse.json({ ok: false, error: 'seal_not_found', seal_id: sealId }, { status: 404 });
    return NextResponse.json({
      ok: true,
      seal_id: sealId,
      digest: historicalAttestationDigest(seal),
      canon: 'Historical attestation validates stored proof. It does not rewrite live history.',
    }, { headers: { 'Cache-Control': 'no-store', 'X-Mobius-Source': 'historical-block-attestation' } });
  }

  const limit = clampLimit(request.nextUrl.searchParams.get('limit'));
  const candidates = await listHistoricalBackfillCandidates(limit);
  return NextResponse.json({
    ok: true,
    count: candidates.length,
    candidates,
    canon: 'Historical back-attestation lists completed Reserve Blocks that still need Sentinel signatures.',
  }, { headers: { 'Cache-Control': 'no-store', 'X-Mobius-Source': 'historical-block-attestation' } });
}
