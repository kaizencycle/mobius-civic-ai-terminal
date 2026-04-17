/**
 * GET /api/vault/seal
 *
 * Public read. Returns the list of attested Seals (newest-first) plus the
 * current candidate state. Used by the Vault chamber UI and external
 * substrate consumers.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { handbookCorsHeaders } from '@/lib/http/handbook-cors';
import { SENTINEL_ATTESTATION_COUNT } from '@/lib/vault-v2/constants';
import { countAllSeals, countSeals, getCandidate, getLatestSeal, listAllSeals, listSeals } from '@/lib/vault-v2/store';

export const dynamic = 'force-dynamic';

export async function OPTIONS(req: NextRequest) {
  const cors = handbookCorsHeaders(req.headers.get('origin'));
  if (!cors) return new NextResponse(null, { status: 204 });
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function GET(req: NextRequest) {
  const cors = handbookCorsHeaders(req.headers.get('origin'));
  const limitParam = Number(req.nextUrl.searchParams.get('limit') ?? '50');
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(200, Math.floor(limitParam)))
    : 50;
  const scope = req.nextUrl.searchParams.get('scope')?.toLowerCase();
  const includeAllHistory = scope === 'all' || scope === 'audit';

  const [seals, total, latest, candidate] = await Promise.all([
    includeAllHistory ? listAllSeals(limit) : listSeals(limit),
    includeAllHistory ? countAllSeals() : countSeals(),
    getLatestSeal(),
    getCandidate(),
  ]);

  return NextResponse.json(
    {
      ok: true,
      scope: includeAllHistory ? 'audit' : 'attested',
      total,
      returned: seals.length,
      latest_seal_id: latest?.seal_id ?? null,
      latest_sealed_at: latest?.sealed_at ?? null,
      candidate:
        candidate === null
          ? null
          : {
              seal_id: candidate.seal_id,
              sequence: candidate.sequence,
              cycle_at_seal: candidate.cycle_at_seal,
              requested_at: candidate.requested_at,
              timeout_at: candidate.timeout_at,
              attestations_received: Object.keys(candidate.attestations).length,
              attestations_needed:
                SENTINEL_ATTESTATION_COUNT - Object.keys(candidate.attestations).length,
              attesting_agents: Object.keys(candidate.attestations),
            },
      seals,
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        ...(cors ?? {}),
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
        'X-Mobius-Source': 'vault-v2-seals',
      },
    },
  );
}
