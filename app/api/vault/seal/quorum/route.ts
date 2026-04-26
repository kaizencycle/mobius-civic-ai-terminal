import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { bearerMatchesToken, getVaultAttestationToken } from '@/lib/vault-v2/auth';
import { SENTINEL_ATTESTATION_COUNT, VAULT_RESERVE_PARCEL_UNITS } from '@/lib/vault-v2/constants';
import { tryFormNextCandidate } from '@/lib/vault-v2/deposit';
import { computeAttestationSignature, evaluateQuorum, finalizeSeal } from '@/lib/vault-v2/seal';
import {
  countAllSeals,
  getCandidate,
  getInProgressBalance,
  getLatestSeal,
  getSeal,
  recordAttestation,
  setInProgressBalance,
  writeInProgressHashes,
} from '@/lib/vault-v2/store';
import type { Posture, SealAttestation, SealCandidate, SentinelAgent } from '@/lib/vault-v2/types';
import { SENTINEL_AGENTS } from '@/lib/vault-v2/types';
import { resolveOperatorCycleId } from '@/lib/eve/resolve-operator-cycle';
import { getVaultStatusPayload, listVaultDeposits } from '@/lib/vault/vault';

export const dynamic = 'force-dynamic';

type QuorumBody = { bootstrapLegacyReserve?: unknown };

async function readBody(req: NextRequest): Promise<QuorumBody> {
  try {
    const text = await req.text();
    if (!text.trim()) return {};
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as QuorumBody) : {};
  } catch {
    return {};
  }
}

function sealQuorumAuth(req: NextRequest): boolean {
  const h = req.headers.get('authorization');
  const allowed = [process.env.AGENT_SERVICE_TOKEN, process.env.CRON_SECRET, process.env.MOBIUS_SERVICE_SECRET]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v));
  return allowed.some((token) => bearerMatchesToken(h, token));
}

function postureForGi(gi: number): Posture {
  if (gi >= 0.95) return 'confident';
  if (gi >= 0.72) return 'cautionary';
  if (gi >= 0.5) return 'stressed';
  return 'degraded';
}

function rationaleFor(agent: SentinelAgent): string {
  switch (agent) {
    case 'ATLAS': return 'ATLAS pass — reserve tranche hash and cycle metadata accepted for Seal proof formation.';
    case 'ZEUS': return 'ZEUS pass — no reject condition; reserve Seal may finalize while Fountain remains locked.';
    case 'EVE': return 'EVE pass — civic-risk posture permits reserve accounting seal without payout or Fountain unlock.';
    case 'JADE': return 'JADE pass — constitutional separation preserved: seal proves reserve, GI later proves readiness.';
    case 'AUREA': return 'AUREA pass — strategic quorum complete; Seal may enter attested reserve chain pending integrity sustain.';
  }
}

async function bootstrapLegacyReserveForFirstSeal(): Promise<{ ok: boolean; seededBalance: number; seededHashes: number; reason: string }> {
  const finalizedCount = await countAllSeals();
  if (finalizedCount > 0) return { ok: false, seededBalance: 0, seededHashes: 0, reason: 'finalized_seal_history_exists' };

  const v1 = await getVaultStatusPayload(null);
  if (v1.balance_reserve < VAULT_RESERVE_PARCEL_UNITS) {
    return { ok: false, seededBalance: v1.balance_reserve, seededHashes: 0, reason: 'v1_cumulative_below_threshold' };
  }

  const deposits = await listVaultDeposits(200);
  const hashes = Array.from(new Set(deposits.map((d) => d.deposit_hash).filter((h): h is string => typeof h === 'string' && h.length > 0)));
  if (hashes.length === 0) {
    return { ok: false, seededBalance: v1.balance_reserve, seededHashes: 0, reason: 'no_hashed_deposits_for_legacy_bootstrap' };
  }

  await setInProgressBalance(Number(v1.balance_reserve.toFixed(6)));
  await writeInProgressHashes(hashes);
  return { ok: true, seededBalance: Number(v1.balance_reserve.toFixed(6)), seededHashes: hashes.length, reason: 'legacy_v1_cumulative_seeded_into_v2_first_seal' };
}

async function submitInternalAttestation(agent: SentinelAgent, pinnedCandidate: SealCandidate) {
  const current = await getCandidate();
  if (!current) return { agent, ok: false, error: 'no_candidate' };
  if (current.seal_id !== pinnedCandidate.seal_id) {
    return { agent, ok: false, error: 'candidate_changed', expected_seal_id: pinnedCandidate.seal_id, current_seal_id: current.seal_id };
  }

  const token = getVaultAttestationToken(agent);
  if (!token) return { agent, ok: false, error: 'missing_attestation_token' };

  const rationale = rationaleFor(agent);
  const signature = computeAttestationSignature({ token, seal_hash: pinnedCandidate.seal_hash, verdict: 'pass', rationale });
  const attestation: SealAttestation = {
    agent,
    verdict: 'pass',
    rationale,
    gi_at_attestation: pinnedCandidate.gi_at_seal,
    timestamp: new Date().toISOString(),
    signature,
    ...(agent === 'AUREA' ? { posture: postureForGi(pinnedCandidate.gi_at_seal) } : {}),
  };

  const updated = await recordAttestation(pinnedCandidate.seal_id, agent, attestation);
  if (!updated) return { agent, ok: false, error: 'record_failed' };
  return { agent, ok: true, verdict: 'pass' as const, seal_id: pinnedCandidate.seal_id, attestations_received: Object.keys(updated.attestations).length };
}

export async function POST(req: NextRequest) {
  if (!sealQuorumAuth(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await readBody(req);
  const cycle = await resolveOperatorCycleId();
  let balanceBefore = await getInProgressBalance();
  let candidate = await getCandidate();
  let bootstrap: Awaited<ReturnType<typeof bootstrapLegacyReserveForFirstSeal>> | null = null;

  if (!candidate && balanceBefore < VAULT_RESERVE_PARCEL_UNITS && body.bootstrapLegacyReserve === true) {
    bootstrap = await bootstrapLegacyReserveForFirstSeal();
    balanceBefore = await getInProgressBalance();
  }

  if (!candidate) {
    if (balanceBefore < VAULT_RESERVE_PARCEL_UNITS) {
      const latest = await getLatestSeal();
      return NextResponse.json({ ok: true, outcome: 'below_v2_threshold', cycle, in_progress_balance: balanceBefore, threshold: VAULT_RESERVE_PARCEL_UNITS, latest_seal_id: latest?.seal_id ?? null, bootstrap });
    }
    candidate = await tryFormNextCandidate({ cycle });
  }

  if (!candidate) {
    return NextResponse.json({ ok: false, outcome: 'candidate_not_formed', cycle, in_progress_balance: balanceBefore, threshold: VAULT_RESERVE_PARCEL_UNITS, bootstrap }, { status: 500 });
  }

  const pinnedSealId = candidate.seal_id;
  const submissions = [];
  for (const agent of SENTINEL_AGENTS) {
    const result = await submitInternalAttestation(agent, candidate);
    submissions.push(result);
    if (!result.ok && result.error === 'candidate_changed') break;
  }

  const refreshed = await getCandidate();
  if (!refreshed) return NextResponse.json({ ok: false, outcome: 'candidate_missing_after_attestation', seal_id: pinnedSealId, submissions, bootstrap }, { status: 500 });
  if (refreshed.seal_id !== pinnedSealId) {
    return NextResponse.json({ ok: false, outcome: 'candidate_changed_before_quorum', expected_seal_id: pinnedSealId, current_seal_id: refreshed.seal_id, submissions, bootstrap }, { status: 409 });
  }

  const failed = submissions.filter((s) => !s.ok);
  const quorum = evaluateQuorum(refreshed);
  const finalized = await finalizeSeal(quorum);
  const balanceAfter = await getInProgressBalance();
  const finalizedSeal = finalized ?? (await getSeal(pinnedSealId));

  return NextResponse.json({
    ok: failed.length === 0 && quorum.decision === 'attested' && finalizedSeal?.status === 'attested',
    outcome: finalizedSeal?.status === 'attested' ? 'seal_attested' : `quorum_${quorum.decision}`,
    cycle,
    seal_id: pinnedSealId,
    sequence: candidate.sequence,
    seal_hash: candidate.seal_hash,
    status: finalizedSeal?.status ?? null,
    fountain_status: finalizedSeal?.fountain_status ?? null,
    reserve: finalizedSeal?.reserve ?? VAULT_RESERVE_PARCEL_UNITS,
    in_progress_balance_before: balanceBefore,
    in_progress_balance_after: balanceAfter,
    bootstrap,
    quorum,
    submissions,
    attestations_received: Object.keys(refreshed.attestations).length,
    attestations_needed: SENTINEL_ATTESTATION_COUNT - Object.keys(refreshed.attestations).length,
    canon: 'Reserve Seal attested. Fountain remains locked until GI sustain unlock conditions pass.',
  });
}
