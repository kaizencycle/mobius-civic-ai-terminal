/**
 * GET /api/mic/readiness
 *
 * MIC_READINESS_V1 — assembled server-side from Vault status + deposit sample.
 * Terminal displays this payload; it does not re-derive policy.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolveOperatorCycleId } from '@/lib/eve/resolve-operator-cycle';
import { buildMicReadinessV1, type VaultStatusJson } from '@/lib/mic/runtime-readiness';
import { loadGIState } from '@/lib/kv/store';
import { computeVaultSealLaneSemantics } from '@/lib/vault/lane-status';
import { getVaultStatusPayload } from '@/lib/vault/vault';
import { countSeals, getCandidate, getInProgressBalance, getLatestSeal } from '@/lib/vault-v2/store';
import { SENTINEL_ATTESTATION_COUNT } from '@/lib/vault-v2/constants';
import { listVaultDeposits } from '@/lib/vault/vault';

export const dynamic = 'force-dynamic';

async function getVaultStatusShape(): Promise<VaultStatusJson> {
  let gi: number | null = null;
  try {
    const st = await loadGIState();
    if (st && typeof st.global_integrity === 'number' && Number.isFinite(st.global_integrity)) {
      gi = Math.max(0, Math.min(1, st.global_integrity));
    }
  } catch {
    gi = null;
  }

  const v1 = await getVaultStatusPayload(gi);

  const [inProgressBalance, sealsCount, latestSeal, candidate] = await Promise.all([
    getInProgressBalance(),
    countSeals(),
    getLatestSeal(),
    getCandidate(),
  ]);

  const seal_lane = computeVaultSealLaneSemantics({
    inProgressBalance,
    sealsCountAttested: sealsCount,
    giCurrent: gi,
    giThreshold: v1.gi_threshold,
    sustainCyclesRequired: v1.sustain_cycles_required,
    v1Status: v1.status,
    candidateInFlight: Boolean(candidate),
  });

  const candidate_attestation_state = candidate
    ? {
        in_flight: true,
        seal_id: candidate.seal_id,
        sequence: candidate.sequence,
        requested_at: candidate.requested_at,
        timeout_at: candidate.timeout_at,
        attestations_received: Object.keys(candidate.attestations).length,
        attestations_needed: SENTINEL_ATTESTATION_COUNT - Object.keys(candidate.attestations).length,
      }
    : {
        in_flight: false,
        seal_id: null,
        attestations_received: 0,
        timeout_at: null,
      };

  return {
    ...v1,
    gi_current: gi,
    in_progress_balance: inProgressBalance,
    sealed_reserve_total: seal_lane.sealed_reserve_total,
    current_tranche_balance: seal_lane.current_tranche_balance,
    carry_forward_in_tranche: seal_lane.carry_forward_in_tranche,
    reserve_threshold_met: seal_lane.reserve_threshold_met,
    gi_threshold_met: seal_lane.gi_threshold_met,
    sustain_cycles_met: seal_lane.sustain_met,
    fountain_status: seal_lane.fountain_lane,
    reserve_lane: seal_lane.reserve_lane,
    seals_count: sealsCount,
    latest_seal_id: latestSeal?.seal_id ?? null,
    latest_seal_at: latestSeal?.sealed_at ?? null,
    latest_seal_hash: latestSeal?.seal_hash ?? null,
    candidate_attestation_state,
  };
}

export async function GET(req: NextRequest) {
  const cycleParam = req.nextUrl.searchParams.get('cycle')?.trim();
  let cycle = cycleParam ?? '';
  if (!cycle) {
    try {
      cycle = (await resolveOperatorCycleId()) ?? '';
    } catch {
      cycle = '';
    }
  }

  const vaultStatus = await getVaultStatusShape();
  const deposits = await listVaultDeposits(120);
  const readiness = buildMicReadinessV1({
    vaultStatus,
    depositsSample: deposits,
    cycle: cycle || undefined,
  });

  return NextResponse.json(readiness, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Mobius-Source': 'mic-readiness-v1',
    },
  });
}
