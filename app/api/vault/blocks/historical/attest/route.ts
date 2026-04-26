import { NextRequest, NextResponse } from 'next/server';
import type { HistoricalAttestationSubmission } from '@/lib/vault-v2/historical-attestation';
import { submitHistoricalBlockAttestation } from '@/lib/vault-v2/historical-attestation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as HistoricalAttestationSubmission;
    const result = await submitHistoricalBlockAttestation(body);
    return NextResponse.json({
      ...result,
      canon: 'Historical attestation validates stored proof. It cannot rewrite history, invent missing hashes, or unlock the Fountain by itself.',
    }, {
      status: result.ok ? 200 : 400,
      headers: {
        'Cache-Control': 'no-store',
        'X-Mobius-Source': 'historical-block-attest',
      },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'historical_attestation_failed',
    }, { status: 500 });
  }
}
