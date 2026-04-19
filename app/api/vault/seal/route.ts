/**
 * GET /api/vault/seal
 *
 * Public read. Returns the list of attested Seals (newest-first) plus the
 * current candidate state. Used by the Vault chamber UI and external
 * substrate consumers.
 *
 * POST /api/vault/seal
 *
 * Operator / cron: explicit Seal candidate attempt when `in_progress_balance`
 * has reached the reserve parcel threshold (50). Does not replace deposit-driven
 * formation — use when you need a synchronous outcome for ops or checklists.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { handbookCorsHeaders } from '@/lib/http/handbook-cors';
import { bearerMatchesToken } from '@/lib/vault-v2/auth';
import { VAULT_RESERVE_PARCEL_UNITS, SENTINEL_ATTESTATION_COUNT } from '@/lib/vault-v2/constants';
import { tryFormNextCandidate } from '@/lib/vault-v2/deposit';
import { countAllSeals, countSeals, getCandidate, getInProgressBalance, getLatestSeal, listAllSeals, listSeals } from '@/lib/vault-v2/store';
import { resolveOperatorCycleId } from '@/lib/eve/resolve-operator-cycle';

export const dynamic = 'force-dynamic';

function sealPostAuth(req: NextRequest): boolean {
  const agents = process.env.AGENT_SERVICE_TOKEN ?? '';
  const cron = process.env.CRON_SECRET ?? '';
  const mobius = process.env.MOBIUS_SERVICE_SECRET ?? '';
  const h = req.headers.get('authorization');
  if (agents && bearerMatchesToken(h, agents)) return true;
  if (cron && bearerMatchesToken(h, cron)) return true;
  if (mobius && bearerMatchesToken(h, mobius)) return true;
  return false;
}

export async function OPTIONS(req: NextRequest) {
  const cors = handbookCorsHeaders(req.headers.get('origin'));
  if (!cors) return new NextResponse(null, { status: 204 });
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(req: NextRequest) {
  const cors = handbookCorsHeaders(req.headers.get('origin'));
  if (!sealPostAuth(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: cors ?? undefined });
  }

  const balance = await getInProgressBalance();
  if (balance < VAULT_RESERVE_PARCEL_UNITS) {
    return NextResponse.json(
      {
        ok: true,
        outcome: 'below_threshold',
        in_progress_balance: balance,
        threshold: VAULT_RESERVE_PARCEL_UNITS,
        message: 'Reserve parcel threshold not met; accrue deposits until balance >= 50.',
      },
      { status: 200, headers: { ...(cors ?? {}), 'Cache-Control': 'no-store', 'X-Mobius-Source': 'vault-v2-seal-post' } },
    );
  }

  const cycle = await resolveOperatorCycleId();
  const candidate = await tryFormNextCandidate({ cycle });

  if (!candidate) {
    const existing = await getCandidate();
    return NextResponse.json(
      {
        ok: true,
        outcome: existing ? 'candidate_already_in_flight' : 'formation_skipped',
        in_progress_balance: balance,
        threshold: VAULT_RESERVE_PARCEL_UNITS,
        candidate_seal_id: existing?.seal_id ?? null,
        message: existing
          ? 'A seal candidate is already awaiting attestations.'
          : 'Threshold met but candidate was not formed (race or store); retry shortly.',
      },
      { status: 200, headers: { ...(cors ?? {}), 'Cache-Control': 'no-store', 'X-Mobius-Source': 'vault-v2-seal-post' } },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      outcome: 'candidate_formed',
      in_progress_balance: await getInProgressBalance(),
      threshold: VAULT_RESERVE_PARCEL_UNITS,
      candidate: {
        seal_id: candidate.seal_id,
        sequence: candidate.sequence,
        cycle_at_seal: candidate.cycle_at_seal,
        seal_hash: candidate.seal_hash,
        requested_at: candidate.requested_at,
        timeout_at: candidate.timeout_at,
        attestations_needed: SENTINEL_ATTESTATION_COUNT,
      },
    },
    { status: 200, headers: { ...(cors ?? {}), 'Cache-Control': 'no-store', 'X-Mobius-Source': 'vault-v2-seal-post' } },
  );
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
