/**
 * GET /api/vault/seal/[id]
 *
 * Public read. Returns a single Seal with full attestation detail. Useful
 * for the Vault chamber modal, cross-substrate verification, and operator
 * review of quarantined seals.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getCandidate, getSeal } from '@/lib/vault-v2/store';
import { verifySealHash } from '@/lib/vault-v2/seal';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const seal = await getSeal(id);
  if (seal) {
    const hash_valid = verifySealHash(seal);
    return NextResponse.json({
      ok: true,
      type: 'seal',
      hash_valid,
      seal,
    });
  }

  const candidate = await getCandidate();
  if (candidate && candidate.seal_id === id) {
    return NextResponse.json({
      ok: true,
      type: 'candidate',
      hash_valid: true,
      candidate,
    });
  }

  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
