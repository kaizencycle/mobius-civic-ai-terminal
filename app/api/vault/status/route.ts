/**
 * GET /api/vault/status
 *
 * v1 + v2 compatibility window (Vault v2 spec §10).
 *
 * Returns the v1 shape unchanged for backward compatibility, AND appends
 * v2 fields: seals_count, latest_seal_at, candidate_attestation_state, etc.
 *
 * During the C-284 → C-285 compatibility window, `balance_reserve` is
 * preserved as a v1 alias (still read from v1 KV, not aliased to
 * `in_progress_balance`) so existing UI surfaces keep working. A new
 * `in_progress_balance` field exposes the v2 canonical accumulator.
 */

import { NextResponse } from 'next/server';
import { loadGIState } from '@/lib/kv/store';
import { computeVaultSealLaneSemantics } from '@/lib/vault/lane-status';
import { getVaultStatusPayload } from '@/lib/vault/vault';
import {
  countAllSeals,
  countSeals,
  getCandidate,
  getInProgressBalance,
  getLatestSeal,
} from '@/lib/vault-v2/store';
import { SENTINEL_ATTESTATION_COUNT } from '@/lib/vault-v2/constants';

export const dynamic = 'force-dynamic';

export async function GET() {
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

  const [inProgressBalance, sealsCount, sealsAuditCount, latestSeal, candidate] = await Promise.all([
    getInProgressBalance(),
    countSeals(),
    countAllSeals(),
    getLatestSeal(),
    getCandidate(),
  ]);

  const seal_lane = computeVaultSealLaneSemantics({
    inProgressBalance: inProgressBalance,
    sealsCountAttested: sealsCount,
    giCurrent: gi,
    giThreshold: v1.gi_threshold,
    sustainCyclesRequired: v1.sustain_cycles_required,
    v1Status: v1.status,
    candidateInFlight: Boolean(candidate),
  });

  const body = {
    ...v1,
    in_progress_balance: inProgressBalance,
    sealed_reserve_total: seal_lane.sealed_reserve_total,
    current_tranche_balance: seal_lane.current_tranche_balance,
    carry_forward_in_tranche: seal_lane.carry_forward_in_tranche,
    reserve_threshold_met: seal_lane.reserve_threshold_met,
    gi_threshold_met: seal_lane.gi_threshold_met,
    sustain_cycles_met: seal_lane.sustain_met,
    fountain_status: seal_lane.fountain_lane,
    reserve_lane: seal_lane.reserve_lane,
    vault_headline: seal_lane.headline,
    vault_canon: seal_lane.canon,
    unseal_requirements_remaining: {
      gi_sustain: !seal_lane.gi_threshold_met || !seal_lane.sustain_met,
      fountain: seal_lane.fountain_lane !== 'active' && seal_lane.fountain_lane !== 'unsealed',
    },
    seals_count: sealsCount,
    seals_audit_count: sealsAuditCount,
    latest_seal_id: latestSeal?.seal_id ?? null,
    latest_seal_at: latestSeal?.sealed_at ?? null,
    latest_seal_hash: latestSeal?.seal_hash ?? null,
    candidate_attestation_state: candidate
      ? {
          in_flight: true,
          seal_id: candidate.seal_id,
          sequence: candidate.sequence,
          requested_at: candidate.requested_at,
          timeout_at: candidate.timeout_at,
          attestations_received: Object.keys(candidate.attestations).length,
          attestations_needed:
            SENTINEL_ATTESTATION_COUNT - Object.keys(candidate.attestations).length,
        }
      : {
          in_flight: false,
          seal_id: null,
          attestations_received: 0,
          timeout_at: null,
        },
    vault_version: 2,
    canonical: 'in_progress_balance',
  };

  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'no-store', 'X-Mobius-Source': 'vault-status-v2' },
  });
}
