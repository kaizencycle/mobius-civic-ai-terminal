/**
 * GET /api/vault/seal-status
 *
 * Diagnostic endpoint surfacing the full seal lifecycle state:
 *   - Active candidate (if any) with per-agent attestation progress
 *   - Quarantined seals with missing-agent digest
 *   - Recent attested seals (last 10)
 *   - In-progress balance vs. formation threshold
 *
 * Used by the Terminal dashboard and CI checks to track quorum progress.
 * Auth: CRON_SECRET bearer OR x-vercel-cron header.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { handbookCorsHeaders } from '@/lib/http/handbook-cors';
import {
  getCandidate,
  getInProgressBalance,
  getLatestSeal,
  listAllSeals,
  countSeals,
  countAllSeals,
} from '@/lib/vault-v2/store';
import { SENTINEL_AGENTS } from '@/lib/vault-v2/types';
import { VAULT_RESERVE_PARCEL_UNITS, SENTINEL_ATTESTATION_COUNT } from '@/lib/vault-v2/constants';
import { resolveOperatorCycleId } from '@/lib/eve/resolve-operator-cycle';
import { loadQuorumState } from '@/lib/mic/quorumTracker';
import type { Seal, SentinelAgent } from '@/lib/vault-v2/types';

export const dynamic = 'force-dynamic';

export async function OPTIONS(req: NextRequest) {
  const cors = handbookCorsHeaders(req.headers.get('origin'));
  if (!cors) return new NextResponse(null, { status: 204 });
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function GET(req: NextRequest) {
  const cors = handbookCorsHeaders(req.headers.get('origin'));
  const started = Date.now();

  try {
    const [candidate, inProgressBalance, latestSeal, allSeals, attestedCount, auditCount, currentCycle] =
      await Promise.all([
        getCandidate(),
        getInProgressBalance(),
        getLatestSeal(),
        listAllSeals(50),
        countSeals(),
        countAllSeals(),
        resolveOperatorCycleId().catch(() => 'unknown'),
      ]);

    const quorumState = await loadQuorumState(currentCycle).catch(() => null);

    // Candidate digest
    const candidateDigest = candidate
      ? {
          seal_id: candidate.seal_id,
          sequence: candidate.sequence,
          cycle: candidate.cycle_at_seal,
          initiated_at: candidate.requested_at,
          timeout_at: candidate.timeout_at,
          ms_to_timeout: Math.max(0, new Date(candidate.timeout_at).getTime() - Date.now()),
          attestations_received: Object.keys(candidate.attestations).length,
          attestations_needed: SENTINEL_ATTESTATION_COUNT,
          attested_agents: Object.keys(candidate.attestations) as SentinelAgent[],
          missing_agents: SENTINEL_AGENTS.filter((a) => !candidate.attestations[a]),
          reserve: candidate.reserve,
        }
      : null;

    // Quarantined seals
    const quarantined = allSeals.filter((s: Seal) => s.status === 'quarantined');
    const quarantinedDigest = quarantined.map((s: Seal) => ({
      seal_id: s.seal_id,
      sequence: s.sequence,
      cycle: s.cycle_at_seal,
      sealed_at: s.sealed_at,
      gi_at_seal: s.gi_at_seal,
      attested_agents: Object.keys(s.attestations) as SentinelAgent[],
      missing_agents: SENTINEL_AGENTS.filter((a) => !s.attestations[a]),
      attestations_received: Object.keys(s.attestations).length,
    }));

    // Recently attested (last 10 by sealed_at desc)
    const recentAttested = allSeals
      .filter((s: Seal) => s.status === 'attested')
      .sort((a: Seal, b: Seal) => new Date(b.sealed_at).getTime() - new Date(a.sealed_at).getTime())
      .slice(0, 10)
      .map((s: Seal) => ({
        seal_id: s.seal_id,
        sequence: s.sequence,
        cycle: s.cycle_at_seal,
        sealed_at: s.sealed_at,
        gi_at_seal: s.gi_at_seal,
        fountain_status: s.fountain_status,
        posture: s.posture,
      }));

    const balanceReadiness = {
      in_progress_balance: inProgressBalance,
      threshold: VAULT_RESERVE_PARCEL_UNITS,
      balance_pct: Math.round((inProgressBalance / VAULT_RESERVE_PARCEL_UNITS) * 100),
      ready_to_form: inProgressBalance >= VAULT_RESERVE_PARCEL_UNITS,
    };

    const body = {
      ok: true,
      at: new Date().toISOString(),
      duration_ms: Date.now() - started,
      current_cycle: currentCycle,
      balance_readiness: balanceReadiness,
      candidate: candidateDigest,
      seals_attested_total: attestedCount,
      seals_audit_total: auditCount,
      seals_quarantined_total: quarantined.length,
      latest_seal: latestSeal
        ? {
            seal_id: latestSeal.seal_id,
            sequence: latestSeal.sequence,
            status: latestSeal.status,
            sealed_at: latestSeal.sealed_at,
            gi_at_seal: latestSeal.gi_at_seal,
          }
        : null,
      quarantined: quarantinedDigest,
      recent_attested: recentAttested,
      sentinel_quorum: quorumState
        ? {
            cycle: quorumState.cycle,
            status: quorumState.status,
            attestations_received: quorumState.attestations_received,
            attestations_needed: quorumState.attestations_needed,
            attested_agents: Object.keys(quorumState.entries),
            pending_agents: quorumState.required.filter((a) => !quorumState.entries[a]),
            initiated_at: quorumState.initiated_at,
            completed_at: quorumState.completed_at,
          }
        : null,
    };

    return NextResponse.json(body, {
      headers: { ...(cors ?? {}) },
    });
  } catch (error) {
    console.error('[vault/seal-status] error', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
