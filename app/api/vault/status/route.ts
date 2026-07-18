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
import { computeAttestationCoverage, attestationHeadlineSuffix } from '@/lib/vault/attestation-coverage';
import { computeReserveBlockTruthSurface, extractCollisionPairCount } from '@/lib/vault/reserve-block-truth';
import { getSealIntegrityGateState } from '@/lib/watchdog/sealIntegrityGate';
import { WATCHDOG_STATE_KEY, type KvWatchdogReport } from '@/lib/watchdog/kvHealthChecks';
import { kvGet } from '@/lib/kv/store';
import { isIdentityServiceConfigured, probeIdentityAttestAuth } from '@/lib/substrate/identityToken';
import { getVaultDepositHashCoverage, getVaultStatusPayload } from '@/lib/vault/vault';
import {
  getCandidate,
  getInProgressBalance,
  getLatestSeal,
  getSealsByIds,
  listAllSealIds,
  listSealIds,
} from '@/lib/vault-v2/store';
import { SENTINEL_ATTESTATION_COUNT } from '@/lib/vault-v2/constants';
import { loadQuorumState } from '@/lib/mic/quorumTracker';
import { resolveOperatorCycleId } from '@/lib/eve/resolve-operator-cycle';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const VAULT_STATUS_TIMEOUT_MS = 12_000;
const VAULT_STATUS_SEAL_SCAN_LIMIT = 500;

export async function OPTIONS(req: NextRequest) {
  const cors = handbookCorsHeaders(req.headers.get('origin'));
  if (!cors) return new NextResponse(null, { status: 204 });
  return new NextResponse(null, { status: 204, headers: cors });
}

async function buildVaultStatus(req: NextRequest) {
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
        gi_provenance = st.source === 'cached' ? 'github-state-mirror' : 'kv-live';
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

  const [attestedIds, allIds, sealIntegrityGate, liveWatchdogReport] = await Promise.all([
    listSealIds(),
    listAllSealIds(),
    getSealIntegrityGateState(),
    kvGet<KvWatchdogReport>(WATCHDOG_STATE_KEY),
  ]);
  const sealsCount = attestedIds.length;
  const sealsAuditCount = allIds.length;
  const recentSealIds = allIds.slice(-VAULT_STATUS_SEAL_SCAN_LIMIT);

  const [inProgressBalance, latestSeal, candidate, allRecentSeals, quorumState, hashCoverage, identityAuth] =
    await Promise.all([
      getInProgressBalance(),
      getLatestSeal(),
      getCandidate(),
      getSealsByIds(recentSealIds).then((seals) => seals.reverse()),
      loadQuorumState(currentCycleForQuorum),
      getVaultDepositHashCoverage(200),
      probeIdentityAttestAuth(),
    ]);

  const quarantinedSeals = allRecentSeals.filter((s) => s.status === 'quarantined');
  const sealsQuarantinedCount = quarantinedSeals.length;
  const sealsNeedingReattestation = quarantinedSeals.map((s) => ({
    seal_id: s.seal_id,
    sequence: s.sequence,
    missing_agents: (['ATLAS', 'ZEUS', 'EVE', 'JADE', 'AUREA'] as const).filter(
      (a) => !s.attestations[a],
    ),
  }));

  // Compact quarantine cycle summary — extracts C-NNN from seal_id pattern for operator UI
  const quarantineCycles = quarantinedSeals
    .map((s) => s.seal_id.match(/C-(\d+)/)?.[0])
    .filter((c): c is string => Boolean(c));
  const quarantineCycleRange =
    quarantineCycles.length > 0
      ? `${quarantineCycles[quarantineCycles.length - 1]}–${quarantineCycles[0]}`
      : null;

  const latestImmortalized = Boolean(latestSeal?.substrate_attestation_id && latestSeal?.substrate_event_hash);

  // C-329: compute REAL substrate-attestation coverage.
  const attestedSeals = allRecentSeals.filter((s) => s.status === 'attested');
  const attestationCoverage = computeAttestationCoverage(attestedSeals);
  const coverageScanLimit = VAULT_STATUS_SEAL_SCAN_LIMIT;
  const coverageIsCapped = sealsAuditCount > coverageScanLimit;

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
    sealIntegrityGateActive: sealIntegrityGate.active,
  });

  const collisionPairCount = extractCollisionPairCount(
    sealIntegrityGate,
    liveWatchdogReport?.findings ?? null,
  );

  const reserve_block_truth = computeReserveBlockTruthSurface({
    reserve_block: seal_lane.reserve_block,
    vault_seal_index_count: sealsCount,
    vault_audit_index_count: sealsAuditCount,
    attestation_coverage: attestationCoverage,
    seal_integrity_gate: sealIntegrityGate,
    collision_pair_count: collisionPairCount,
    candidate_in_flight: Boolean(candidate),
    reserve_threshold_met: seal_lane.reserve_threshold_met,
    latest_seal_id: latestSeal?.seal_id ?? null,
    latest_canonical_seal_id: null,
  });

  const honestHeadline =
    reserve_block_truth.headline + attestationHeadlineSuffix(attestationCoverage);

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
    vault_headline: honestHeadline,
    reserve_block_truth,
    seal_integrity_gate: reserve_block_truth.integrity_gate,
    operator_summary: reserve_block_truth.operator_summary,
    collision_pair_count: reserve_block_truth.collision_pair_count,
    canonical_reserve_blocks: reserve_block_truth.canonical_reserve_blocks,
    canonical_lineage_status: reserve_block_truth.canonical_lineage_status,
    formation_status: reserve_block_truth.formation_status,
    // C-329: substrate-attestation coverage — the truth the old payload omitted.
    // `examined` covers attested seals only (quarantined/rejected never have substrate
    // attestation attempted). `scan_capped` is true when the vault exceeds the 500-seal
    // window; in that case substrate_ok reflects the visible window, not all-time history.
    substrate_attestation_coverage: {
      examined: attestationCoverage.examined,
      immortalized: attestationCoverage.immortalized,
      errored: attestationCoverage.errored,
      unattested: attestationCoverage.unattested,
      coverage_ratio: attestationCoverage.coverage_ratio,
      has_gap: attestationCoverage.has_gap,
      latest_error: attestationCoverage.latest_error,
      gap_cycle_range: attestationCoverage.gap_cycle_range,
      scan_limit: coverageScanLimit,
      scan_capped: coverageIsCapped,
      total_audit_count: sealsAuditCount,
    },
    vault_canon: seal_lane.canon,
    unseal_requirements_remaining: {
      gi_sustain: !seal_lane.gi_threshold_met || !seal_lane.sustain_met,
      fountain: seal_lane.fountain_lane !== 'active' && seal_lane.fountain_lane !== 'unsealed',
    },
    seals_count: sealsCount,
    seals_audit_count: sealsAuditCount,
    seals_quarantined_count: sealsQuarantinedCount,
    quarantine_cycle_range: quarantineCycleRange,
    quarantine_cycle_list: quarantineCycles,
    seals_needing_reattestation: sealsNeedingReattestation,
    latest_seal_id: latestSeal?.seal_id ?? null,
    latest_seal_at: latestSeal?.sealed_at ?? null,
    latest_seal_hash: latestSeal?.seal_hash ?? null,
    substrate_attestation_id: latestSeal?.substrate_attestation_id ?? null,
    substrate_event_hash: latestSeal?.substrate_event_hash ?? null,
    substrate_attested_at: latestSeal?.substrate_attested_at ?? null,
    substrate_attestation_error: latestSeal?.substrate_attestation_error ?? null,
    identity_service_configured: isIdentityServiceConfigured(),
    identity_login_ok: identityAuth.login_ok,
    identity_introspect_ok: identityAuth.introspect_ok,
    identity_attest_diagnosis: identityAuth.diagnosis,
    // C-329: substrate_ok reflects immortalization across the scanned attested window.
    // When capped, it's conservative (false = gap in window or error on latest seal).
    // substrate_attestation_coverage.scan_capped tells callers when the window is partial.
    substrate_ok: !attestationCoverage.has_gap && !latestSeal?.substrate_attestation_error && !coverageIsCapped,
    substrate_ok_latest_only: !latestSeal?.substrate_attestation_error,
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
      // OPT-09 (C-312): vault status changes on cron ticks (vault-attestation, heartbeat).
      // 30s edge cache with 120s SWR eliminates the MISS-on-every-load pattern while
      // keeping data fresh enough for operator review.
      // Vary: Origin ensures CDN caches separate variants for CORS vs non-CORS requests
      // so handbook/browser callers always receive the correct Access-Control-Allow-Origin.
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
      'Vary': 'Origin',
      'X-Mobius-Source': 'vault-status-v2',
    },
  });
}

function vaultLogContext(req: NextRequest): string {
  const invoker = req.headers.get('x-mobius-invoker');
  return invoker ? `invoker=${invoker}` : `path=${req.nextUrl.pathname}`;
}

export async function GET(req: NextRequest) {
  const cors = handbookCorsHeaders(req.headers.get('origin'));
  const logCtx = vaultLogContext(req);
  try {
    // C-354/C-375: top-level timeout — vault aggregates many KV reads. MGET batching and
    // deduped index reads keep typical production under budget; 12s covers cold starts.
    return await Promise.race([
      buildVaultStatus(req),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('vault_status_timeout')), VAULT_STATUS_TIMEOUT_MS),
      ),
    ]);
  } catch (err) {
    const isTimeout = err instanceof Error && err.message === 'vault_status_timeout';
    console.warn(
      `[vault/status] ${isTimeout ? `timed out after ${VAULT_STATUS_TIMEOUT_MS / 1000}s` : 'error'} (${logCtx})`,
      isTimeout ? '' : err,
    );
    // Return 503 so response.ok is false — callers (vault-context, snapshot timedHandler)
    // key off HTTP status to gate data usage, not body.ok. A 200 with ok:false body
    // caused them to treat null vault fields as readable data.
    return NextResponse.json(
      {
        ok: false,
        status: 'degraded',
        reason: isTimeout ? 'kv_timeout' : 'internal_error',
        vault_version: 2,
        balance_reserve: null,
        in_progress_balance: null,
        seals_count: null,
        substrate_ok: null,
        blocks: [],
        quarantine_cycle_list: [],
        seals_needing_reattestation: [],
      },
      {
        status: 503,
        headers: {
          ...(cors ?? {}),
          'Cache-Control': 'no-store',
          'X-Mobius-Source': 'vault-status-degraded',
        },
      },
    );
  }
}
