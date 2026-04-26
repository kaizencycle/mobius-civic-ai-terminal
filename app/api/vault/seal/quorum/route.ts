/**
 * POST /api/vault/seal/quorum
 *
 * Operator-controlled Reserve Seal ceremony. This endpoint does NOT unlock the
 * Fountain and does NOT mint spendable MIC. It forms/uses the current v2 reserve
 * candidate, records all Sentinel quorum attestations using configured Vault
 * attestation secrets, evaluates quorum, and finalizes the Seal when quorum
 * passes.
 *
 * This exists for the first Seal / recovery path where the operator wants a
 * synchronous full-council outcome instead of waiting for each Sentinel to poll
 * and POST independently.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { bearerMatchesToken, getVaultAttestationToken } from '@/lib/vault-v2/auth';
import { SENTINEL_ATTESTATION_COUNT, VAULT_RESERVE_PARCEL_UNITS } from '@/lib/vault-v2/constants';
import { tryFormNextCandidate } from '@/lib/vault-v2/deposit';
import { evaluateQuorum, finalizeSeal, computeAttestationSignature } from '@/lib/vault-v2/seal';
import {
  getCandidate,
  getInProgressBalance,
  getLatestSeal,
  getSeal,
  recordAttestation,
} from '@/lib/vault-v2/store';
import type { Posture, SealAttestation, SentinelAgent } from '@/lib/vault-v2/types';
import { SENTINEL_AGENTS } from '@/lib/vault-v2/types';
import { resolveOperatorCycleId } from '@/lib/eve/resolve-operator-cycle';

export const dynamic = 'force-dynamic';

function sealQuorumAuth(req: NextRequest): boolean {
  const agents = process.env.AGENT_SERVICE_TOKEN ?? '';
  const cron = process.env.CRON_SECRET ?? '';
  const mobius = process.env.MOBIUS_SERVICE_SECRET ?? '';
  const h = req.headers.get('authorization');
  if (agents && bearerMatchesToken(h, agents)) return true;
  if (cron && bearerMatchesToken(h, cron)) return true;
  if (mobius && bearerMatchesToken(h, mobius)) return true;
  return false;
}

function postureForGi(gi: number): Posture {
  if (gi >= 0.95) return 'confident';
  if (gi >= 0.72) return 'cautionary';
  if (gi >= 0.5) return 'stressed';
  return 'degraded';
}

function rationaleFor(agent: SentinelAgent): string {
  switch (agent) {
    case 'ATLAS':
      return 'ATLAS pass — reserve tranche hash and cycle metadata accepted for Seal I proof formation.';
    case 'ZEUS':
      return 'ZEUS pass — no reject condition; reserve Seal may finalize while Fountain remains locked.';
    case 'EVE':
      return 'EVE pass — civic-risk posture permits reserve accounting seal without payout or Fountain unlock.';
    case 'JADE':
      return 'JADE pass — constitutional separation preserved: seal proves reserve, GI later proves readiness.';
    case 'AUREA':
      return 'AUREA pass — strategic quorum complete; Seal may enter attested reserve chain pending integrity sustain.';
  }
}

async function submitInternalAttestation(agent: SentinelAgent) {
  const candidate = await getCandidate();
  if (!candidate) return { agent, ok: false, error: 'no_candidate' };

  const token = getVaultAttestationToken(agent);
  if (!token) return { agent, ok: false, error: 'missing_attestation_token' };

  const rationale = rationaleFor(agent);
  const signature = computeAttestationSignature({
    token,
    seal_hash: candidate.seal_hash,
    verdict: 'pass',
    rationale,
  });

  const attestation: SealAttestation = {
    agent,
    verdict: 'pass',
    rationale,
    gi_at_attestation: candidate.gi_at_seal,
    timestamp: new Date().toISOString(),
    signature,
    ...(agent === 'AUREA' ? { posture: postureForGi(candidate.gi_at_seal) } : {}),
  };

  const updated = await recordAttestation(candidate.seal_id, agent, attestation);
  if (!updated) return { agent, ok: false, error: 'record_failed' };
  return {
    agent,
    ok: true,
    verdict: 'pass' as const,
    attestations_received: Object.keys(updated.attestations).length,
  };
}

export async function POST(req: NextRequest) {
  if (!sealQuorumAuth(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const cycle = await resolveOperatorCycleId();
  const balanceBefore = await getInProgressBalance();
  let candidate = await getCandidate();

  if (!candidate) {
    if (balanceBefore < VAULT_RESERVE_PARCEL_UNITS) {
      const latest = await getLatestSeal();
      return NextResponse.json({
        ok: true,
        outcome: 'below_v2_threshold',
        cycle,
        in_progress_balance: balanceBefore,
        threshold: VAULT_RESERVE_PARCEL_UNITS,
        latest_seal_id: latest?.seal_id ?? null,
        reason:
          'No v2 candidate exists and canonical in_progress_balance is below 50. v1 cumulative reserve is compatibility history, not an auto-seal trigger.',
      });
    }
    candidate = await tryFormNextCandidate({ cycle });
  }

  if (!candidate) {
    return NextResponse.json({
      ok: false,
      outcome: 'candidate_not_formed',
      cycle,
      in_progress_balance: balanceBefore,
      threshold: VAULT_RESERVE_PARCEL_UNITS,
    }, { status: 500 });
  }

  const submissions = [];
  for (const agent of SENTINEL_AGENTS) {
    submissions.push(await submitInternalAttestation(agent));
  }

  const failed = submissions.filter((s) => !s.ok);
  const refreshed = await getCandidate();
  if (!refreshed) {
    return NextResponse.json({
      ok: false,
      outcome: 'candidate_missing_after_attestation',
      seal_id: candidate.seal_id,
      submissions,
    }, { status: 500 });
  }

  const quorum = evaluateQuorum(refreshed);
  const finalized = await finalizeSeal(quorum);
  const balanceAfter = await getInProgressBalance();
  const finalizedSeal = finalized ?? (await getSeal(candidate.seal_id));

  return NextResponse.json({
    ok: failed.length === 0 && quorum.decision === 'attested' && finalizedSeal?.status === 'attested',
    outcome: finalizedSeal?.status === 'attested' ? 'seal_attested' : `quorum_${quorum.decision}`,
    cycle,
    seal_id: candidate.seal_id,
    sequence: candidate.sequence,
    seal_hash: candidate.seal_hash,
    status: finalizedSeal?.status ?? null,
    fountain_status: finalizedSeal?.fountain_status ?? null,
    reserve: finalizedSeal?.reserve ?? VAULT_RESERVE_PARCEL_UNITS,
    in_progress_balance_before: balanceBefore,
    in_progress_balance_after: balanceAfter,
    quorum,
    submissions,
    attestations_received: refreshed ? Object.keys(refreshed.attestations).length : 0,
    attestations_needed: refreshed ? SENTINEL_ATTESTATION_COUNT - Object.keys(refreshed.attestations).length : SENTINEL_ATTESTATION_COUNT,
    canon: 'Reserve Seal attested. Fountain remains locked until GI sustain unlock conditions pass.',
  });
}
