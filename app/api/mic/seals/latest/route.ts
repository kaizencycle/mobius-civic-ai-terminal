/**
 * GET /api/mic/seals/latest
 *
 * MIC_SEAL_V1 snapshot + hash (from merged MIC readiness).
 */

import { NextResponse } from 'next/server';
import { buildMicSealSnapshotBody } from '@/lib/mic/proof-payloads';
import { withHash } from '@/lib/mic/hash';
import { getMergedMicReadiness } from '@/lib/mic/assembleMicReadiness';
import { getLatestSeal } from '@/lib/vault-v2/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const full = await getMergedMicReadiness();
  const { readiness_proof: _rp, ...readiness } = full;
  const latestSeal = await getLatestSeal();

  const body = buildMicSealSnapshotBody(readiness);
  const { payload, hash } = withHash(body);

  return NextResponse.json(
    {
      ...payload,
      hash,
      hash_algorithm: 'sha256',
      previous_hash: latestSeal?.seal_hash ?? null,
    },
    { headers: { 'Cache-Control': 'no-store', 'X-Mobius-Source': 'mic-seal-latest' } },
  );
}
