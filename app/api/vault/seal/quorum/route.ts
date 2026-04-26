/**
 * POST /api/vault/seal/quorum
 *
 * Operator-controlled Reserve Seal ceremony. This endpoint does NOT unlock the
 * Fountain and does NOT mint spendable MIC. It forms/uses the current v2 reserve
 * candidate, records all Sentinel quorum attestations using configured Vault
 * attestation secrets, evaluates quorum, and finalizes the Seal when quorum
 * passes.
 *
 * Optional first-seal migration:
 *   { "bootstrapLegacyReserve": true }
 *
 * This explicitly seeds v2 from the existing v1 cumulative reserve only when no
 * attested Seal exists yet. It is operator controlled so compatibility history
 * is never silently converted into canon.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { bearerMatchesToken, getVaultAttestationToken } from '@/lib/vault-v2/auth';
import { SENTINEL_ATTESTATION_COUNT, VAULT_RESERVE_PARCEL_UNITS } from '@/lib/vault-v2/constants';
import { tryFormNextCandidate } from '@/lib/vault-v2/deposit';
import { evaluateQuorum, finalizeSeal, computeAttestationSignature } from '@/lib/vault-v2/seal';
import {
  countSeals,
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

type QuorumBody = {
  bootstrapLegacyReserve?: unknown;
};

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
      return 'ATLAS pass — reserve block hash and cycle metadata accepted for Seal I proof formation.';
    case 'ZEUS':
      return 'ZEUS pass — no reject condition; reserve Block may finalize while Fountain remains locked.';
    case 'EVE':
      return 'EVE pass — civic-risk posture permits reserve accounting block without payout or Fountain unlock.';
    case 'JADE':
      return 'JADE pass — constitutional separation preserved: block proves reserve, GI later proves readiness.';
    case 'AUREA':
      return 'AUREA pass — strategic quorum complete; Reserve Block may enter attested chain pending integrity sustain.';
  }
}

async function bootstrapLegacyReserveForFirstSeal(): Promise<{
  ok: boolean;
  seededBalance: number;
  seededHashes: number;
  reason: string;
}> {
  const attestedCount = await countSeals();
  if (attestedCount > 0) return { ok: false, seededBalance: 0, seededHashes: 0, reason: 'attested_seal_already_exists' };

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
  return {
    ok: true,
    seededBalance: Number(v1.balance_reserve.toFixed(6)),
    seededHashes: hashes.length,
    reason: 'legacy_v1_cumulative_seeded_into_v2_first_seal',
  };
}

async function submitInternalAttestation(agent: SentinelAgent, pinnedCandidate: SealCandidate) {
  const current = await getCandidate();
  if (!current) return { agent, ok: false, error: 'no_candidate' };
  if (current.seal_id !== pinnedCandidate.seal_id) return { agent, ok: false, error: 'candidate_changed' };

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
  return { agent, ok: true, verdict: 'pass' as const, attestations_received: Object.keys(updated.attestations).length };
}

export async function POST(req: NextRequest) {
  if (!sealQuorumAuth(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await readBody(req);
  const bootstrapLegacyReserve = body.bootstrapLegacyReserve === true;
  const cycle = await resolveOperatorCycleId();
  let balanceBefore = await getInProgressBalance();
  let candidate = await getCandidate();
  let bootstrap: Awaited<ReturnType<typeof bootstrapLegacyReserveForFirstSeal>> | null = null;

  if (!candidate && balanceBefore < VAULT_RESERVE_PARCEL_UNITS && bootstrapLegacyReserve) {
    bootstrap = await bootstrapLegacyReserveForFirstSeal();
    balanceBefore = await getInProgressBalance();
  }

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
        bootstrap,
        reason: 'No v2 candidate exists and canonical in_progress_balance is below 50. Pass bootstrapLegacyReserve=true only for explicit first-seal migration from v1 cumulative reserve.',
      });
    }
    candidate = await tryFormNextCandidate({ cycle });
  }

  if (!candidate) {
    return NextResponse.json({ ok: false, outcome: 'candidate_not_formed', cycle, in_progress_balance: balanceBefore, threshold: VAULT_RESERVE_PARCEL_UNITS, bootstrap }, { status: 500 });
  }

  const pinnedCandidate = candidate;
  const submissions = [];
  for (const agent of SENTINEL_AGENTS) {
    const result = await submitInternalAttestation(agent, pinnedCandidate);
    submissions.push(result);
    if (!result.ok && result.error === 'candidate_changed') break;
  }

  const failed = submissions.filter((s) => !s.ok);
  const refreshed = await getCandidate();
  if (!refreshed) {
    return NextResponse.json({ ok: false, outcome: 'candidate_missing_after_attestation', seal_id: pinnedCandidate.seal_id, submissions, bootstrap }, { status: 500 });
  }

  const quorum = evaluateQuorum(refreshed);
  const finalized = await finalizeSeal(quorum);
  const balanceAfter = await getInProgressBalance();
  const finalizedSeal = finalized ?? (await getSeal(pinnedCandidate.seal_id));

  return NextResponse.json({
    ok: failed.length === 0 && quorum.decision === 'attested' && finalizedSeal?.status === 'attested',
    outcome: finalizedSeal?.status === 'attested' ? 'seal_attested' : `quorum_${quorum.decision}`,
    cycle,
    seal_id: pinnedCandidate.seal_id,
    sequence: pinnedCandidate.sequence,
    reserve_block: pinnedCandidate.sequence,
    seal_hash: pinnedCandidate.seal_hash,
    status: finalizedSeal?.status ?? null,
    fountain_status: finalizedSeal?.fountain_status ?? null,
    reserve: finalizedSeal?.reserve ?? VAULT_RESERVE_PARCEL_UNITS,
    substrate_attestation_id: finalizedSeal?.substrate_attestation_id ?? null,
    substrate_event_hash: finalizedSeal?.substrate_event_hash ?? null,
    substrate_attested_at: finalizedSeal?.substrate_attested_at ?? null,
    substrate_attestation_error: finalizedSeal?.substrate_attestation_error ?? null,
    immortalized: Boolean(finalizedSeal?.substrate_attestation_id && finalizedSeal?.substrate_event_hash),
    in_progress_balance_before: balanceBefore,
    in_progress_balance_after: balanceAfter,
    bootstrap,
    quorum,
    submissions,
    attestations_received: refreshed ? Object.keys(refreshed.attestations).length : 0,
    attestations_needed: refreshed ? SENTINEL_ATTESTATION_COUNT - Object.keys(refreshed.attestations).length : SENTINEL_ATTESTATION_COUNT,
    canon: 'Reserve Block attested. Substrate pointer recorded when available. Fountain remains locked until GI sustain unlock conditions pass.',
  });
}
