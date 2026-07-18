/**
 * POST /api/vault/attest — C-298 quorum registration compatibility alias.
 *
 * ZEUS verification and sentinel quorum probes expect this path. Canonical
 * implementation lives at POST /api/vault/seal/attest (candidate attestation).
 *
 * Does not bypass seal-integrity gate or collision reconciliation — pass
 * attestations remain withheld when the gate is active (423).
 */

import { NextResponse } from 'next/server';
import { POST as postSealAttest } from '@/app/api/vault/seal/attest/route';

export const dynamic = 'force-dynamic';

/** Route liveness probe for ZEUS / operator verification (no KV writes). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    route: '/api/vault/attest',
    canonical: '/api/vault/seal/attest',
    methods: ['GET', 'POST'],
    purpose: 'C-298 sentinel quorum registration alias',
    note: 'POST delegates to seal candidate attestation. Integrity gate still applies.',
  });
}

export async function POST(req: Request) {
  return postSealAttest(req as import('next/server').NextRequest);
}
