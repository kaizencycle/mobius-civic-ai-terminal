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

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { handbookCorsHeaders } from '@/lib/http/handbook-cors';
import { loadGIState } from '@/lib/kv/store';
import { resolveGiForTerminal } from '@/lib/integrity/resolveGi';
import { loadMicReadinessSnapshotRaw } from '@/lib/mic/loadReadinessSnapshot';
import { computeVaultSealLaneSemantics } from '@/lib/vault/lane-status';
import { getVaultDepositHashCoverage, getVaultStatusPayload } from '@/lib/vault/vault';
import {
  countAllSeals,
  countSeals,
  getCandidate,
  getInProgressBalance,
  getLatestSeal,
  listAllSeals,
} from '@/lib/vault-v2/store';
import { SENTINEL_ATTESTATION_COUNT } from '@/lib/vault-v2/constants';
import { loadQuorumState } from '@/lib/mic/quorumTracker';
import { resolveOperatorCycleId } from '@/lib/eve/resolve-operator-cycle';

export const dynamic = 'force-dynamic';

export async function OPTIONS(req: NextRequest) {
  const cors = handbookCorsHeaders(req.headers.get('origin'));
  if (!cors) return new NextResponse(null, { status: 204 });
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function GET(req: NextRequest) {
  const cors = handbookCorsHeaders(req.headers.get('origin'));
  let gi: number | null = null;
  let gi_provenance: string | null = null;
  try {
    const st = await loadGIState();
    if (st && typeof st.global_integrity === 'number' && Number.isFinite(st.global_integrity)) {
      const age = Date.now() - new Date(st.timestamp).getTime();
      // Sweep cron runs every 10 min — use 12 min window so GI doesn't read stale between ticks.
      const maxAgeMs = st.gi_write_source === 'micro_sweep' ? 12 * 60 * 1000 : 15 * 60 * 1000;
      if (age < maxAgeMs) {
        gi = Math.max(0, Math.min(1, st.global_integrity));
        gi_provenance = 'kv-live';
      }
    }
    if (gi === null) {
      const micRaw = await loadMicReadinessSnapshotRaw();
      const chain = await resolveGiForTerminal({ micReadinessSnapshotRaw: micRaw.raw });
      if (typeof chain.gi === 'number' && Number.isFinite(chain.gi)) {
        gi = chain.gi;
        gi_provenance = chain.gi_provenance;
      }
    }
  } catch {
    gi = null;
  }

  const v1 = await getVaultStatusPayload(gi);

  let currentCycleForQuorum = 'unknown';
  try {
    currentCycleForQuorum = await resolveOperatorCycleId();
  } catch {
    // non-fatal — quorum state will show as pending
  }

  const [inProgressBalance, sealsCount, sealsAuditCount, latestSeal, candidate, allRecentSeals, quorumState] =
    await Promise.all([
      getInProgressBalance(),
      countSeals(),
      countAllSeals(),
      getLatestSeal(),
      getCandidate(),
      listAllSeals(50),
      loadQuorumState(currentCycleForQuorum),
    ]);

  const sealsQuarantinedCount = allRecentSeals.filter((s) => s.status === 'quarantined').length;
  const sealsNeedingReattestation = allRecentSeals
    .filter((s) => s.status === 'quarantined')
    .map((s) => ({
      seal_id: s.seal_id,
      sequence: s.sequence,
      missing_agents: (['ATLAS', 'ZEUS', 'EVE', 'JADE', 'AUREA'] as const).filter(
        (a) => !s.attestations[a],
      ),
    }));

  const seal_lane = computeVaultSealLaneSemantics({
    v1BalanceReserve: v1.balance_reserve,
    inProgressBalance,
    sealsCountAttested: sealsCount,
    sealsAuditCount,
    giCurrent: gi,
    giThreshold: v1.gi_threshold,
    sustainCyclesRequired: v1.sustain_cycles_required,
    v1Status: v1.status,
    candidateInFlight: Boolean(candidate),
  });

  const hashCoverage = await getVaultDepositHashCoverage(200);
  const latestImmortalized = Boolean(latestSeal?.substrate_attestation_id && latestSeal?.substrate_event_hash);

  const body = {
    ...v1,
    gi_resolution: gi_provenance ? { provenance: gi_provenance } : undefined,
    in_progress_balance: inProgressBalance,
    sealed_reserve_total: seal_lane.sealed_reserve_total,
    current_tranche_balance: seal_lane.current_tranche_balance,
    carry_forward_in_tranche: seal_lane.carry_forward_in_tranche,
    reserve_block: seal_lane.reserve_block,
    reserve_block_label: seal_lane.reserve_block.label,
    reserve_block_size: seal_lane.reserve_block.block_size,
    reserve_blocks_completed_v1: seal_lane.reserve_block.completed_blocks_v1,
    reserve_blocks_sealed: seal_lane.reserve_block.sealed_blocks,
    reserve_blocks_audit: seal_lane.reserve_block.audit_blocks,
    reserve_block_in_progress: seal_lane.reserve_block.in_progress_block,
    reserve_block_progress_pct: seal_lane.reserve_block.in_progress_pct,
    reserve_threshold_met: seal_lane.reserve_threshold_met,
    gi_threshold_met: seal_lane.gi_threshold_met,
    sustain_cycles_met: seal_lane.sustain_met,
    fountain_status: seal_lane.fountain_lane,
    reserve_lane: seal_lane.reserve_lane,
    reserve_block_lane: seal_lane.reserve_block_lane,
    vault_headline: seal_lane.headline,
    vault_canon: seal_lane.canon,
    unseal_requirements_remaining: {
      gi_sustain: !seal_lane.gi_threshold_met || !seal_lane.sustain_met,
      fountain: seal_lane.fountain_lane !== 'active' && seal_lane.fountain_lane !== 'unsealed',
    },
    seals_count: sealsCount,
    seals_audit_count: sealsAuditCount,
    seals_quarantined_count: sealsQuarantinedCount,
    seals_needing_reattestation: sealsNeedingReattestation,
    latest_seal_id: latestSeal?.seal_id ?? null,
    latest_seal_at: latestSeal?.sealed_at ?? null,
    latest_seal_hash: latestSeal?.seal_hash ?? null,
    substrate_attestation_id: latestSeal?.substrate_attestation_id ?? null,
    substrate_event_hash: latestSeal?.substrate_event_hash ?? null,
    substrate_attested_at: latestSeal?.substrate_attested_at ?? null,
    substrate_attestation_error: latestSeal?.substrate_attestation_error ?? null,
    latest_block_immortalized: latestImmortalized,
    candidate_attestation_state: candidate
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
        },
    sentinel_quorum: {
      cycle: quorumState.cycle,
      status: quorumState.status,
      attestations_received: quorumState.attestations_received,
      attestations_needed: quorumState.attestations_needed,
      attested_agents: Object.values(quorumState.entries)
        .filter((e) => e?.attested)
        .map((e) => e!.agent),
      pending_agents: quorumState.required.filter(
        (a) => !quorumState.entries[a]?.attested,
      ),
      initiated_at: quorumState.initiated_at,
      completed_at: quorumState.completed_at,
    },
    vault_version: 2,
    canonical: 'in_progress_balance',
    hashed_deposits_count: hashCoverage.hashed_deposits_count,
    legacy_deposits_count: hashCoverage.legacy_deposits_count,
    hash_coverage_pct: hashCoverage.hash_coverage_pct,
    hash_coverage_rows_scanned: hashCoverage.rows_scanned,
    _balance_reserve_deprecated:
      'balance_reserve is v1 cumulative compat. Prefer reserve_block + in_progress_balance + sealed_reserve_total for Reserve Block truth. Removed in a later cycle.',
    _tranche_language_deprecated:
      'tranche fields remain for API compatibility. Operator-facing UI should use Reserve Block language.',
  };

  return NextResponse.json(body, {
    headers: {
      ...(cors ?? {}),
      'Cache-Control': 'no-store',
      'X-Mobius-Source': 'vault-status-v2',
      Deprecation: 'true',
    },
  });
}
