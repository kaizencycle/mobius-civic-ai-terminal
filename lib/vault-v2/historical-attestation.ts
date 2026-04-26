import type { Seal, SealAttestation, SentinelAgent } from '@/lib/vault-v2/types';
import { SENTINEL_AGENTS } from '@/lib/vault-v2/types';
import { getSeal, listAllSeals, writeSeal } from '@/lib/vault-v2/store';
import type { AgentSignedAction } from '@/lib/agents/signatures';
import { hashPayload, verifyAgentAction } from '@/lib/agents/signatures';
import { consumeDedupeKey } from '@/lib/agents/dedupe';
import { kvGet, kvSet } from '@/lib/kv/store';

export const HISTORICAL_ATTESTATION_VERSION = 'C-293.phase7.v1' as const;
const HISTORICAL_ATTESTATION_TTL_SECONDS = 60 * 60 * 24 * 365;

export type HistoricalBlockAttestationPayload = {
  version: typeof HISTORICAL_ATTESTATION_VERSION;
  action: 'historical_quorum_attestation';
  seal_id: string;
  seal_hash: string;
  sequence: number;
  cycle_at_seal: string;
  reserve: 50;
  gi_at_seal: number;
  mode_at_seal: Seal['mode_at_seal'];
  source_entries: number;
  deposit_hashes: string[];
  prev_seal_hash: string | null;
  historical: true;
  review_basis: 'stored_seal_record';
};

export type HistoricalAttestationSubmission = {
  agent: SentinelAgent;
  seal_id: string;
  verdict: SealAttestation['verdict'];
  rationale: string;
  mii_at_attestation?: number | null;
  posture?: SealAttestation['posture'];
  signed: AgentSignedAction;
};

function historicalAttestationKey(sealId: string, agent: SentinelAgent): string {
  return `vault:historical_attestation:${sealId}:${agent}`;
}

export function buildHistoricalAttestationPayload(seal: Seal): HistoricalBlockAttestationPayload {
  return {
    version: HISTORICAL_ATTESTATION_VERSION,
    action: 'historical_quorum_attestation',
    seal_id: seal.seal_id,
    seal_hash: seal.seal_hash,
    sequence: seal.sequence,
    cycle_at_seal: seal.cycle_at_seal,
    reserve: seal.reserve,
    gi_at_seal: seal.gi_at_seal,
    mode_at_seal: seal.mode_at_seal,
    source_entries: seal.source_entries,
    deposit_hashes: [...seal.deposit_hashes],
    prev_seal_hash: seal.prev_seal_hash,
    historical: true,
    review_basis: 'stored_seal_record',
  };
}

export function missingSentinelAgents(seal: Seal): SentinelAgent[] {
  return SENTINEL_AGENTS.filter((agent) => !seal.attestations?.[agent]);
}

async function loadHistoricalAttestationSidecars(sealId: string): Promise<Partial<Record<SentinelAgent, SealAttestation>>> {
  const rows = await Promise.all(
    SENTINEL_AGENTS.map(async (agent) => [agent, await kvGet<SealAttestation>(historicalAttestationKey(sealId, agent))] as const),
  );
  return Object.fromEntries(rows.filter(([, attestation]) => Boolean(attestation))) as Partial<Record<SentinelAgent, SealAttestation>>;
}

async function mergeHistoricalAttestationIntoSeal(sealId: string): Promise<Seal | null> {
  const latest = await getSeal(sealId);
  if (!latest) return null;
  const sidecars = await loadHistoricalAttestationSidecars(sealId);
  const next: Seal = {
    ...latest,
    attestations: { ...latest.attestations, ...sidecars },
    posture: sidecars.AUREA?.posture ?? latest.posture,
  };
  await writeSeal(next);
  return next;
}

export async function listHistoricalBackfillCandidates(limit = 25) {
  const seals = await listAllSeals(limit);
  return seals.map((seal) => {
    const missing = missingSentinelAgents(seal);
    return {
      seal_id: seal.seal_id,
      sequence: seal.sequence,
      status: seal.status,
      seal_hash: seal.seal_hash,
      missing_agents: missing,
      ready_for_back_attestation: seal.deposit_hashes.length > 0 && Boolean(seal.seal_hash) && missing.length > 0,
    };
  });
}

export async function submitHistoricalBlockAttestation(submission: HistoricalAttestationSubmission) {
  const seal = await getSeal(submission.seal_id);
  if (!seal) return { ok: false, reason: 'seal_not_found' as const };
  if (submission.agent !== submission.signed.agent) return { ok: false, reason: 'agent_mismatch' as const };
  if (!SENTINEL_AGENTS.includes(submission.agent)) return { ok: false, reason: 'agent_not_sentinel' as const };
  if (seal.attestations?.[submission.agent]) return { ok: false, reason: 'historical_attestation_already_present' as const, seal };

  const payload = buildHistoricalAttestationPayload(seal);
  if (submission.signed.action !== 'historical_quorum_attestation') {
    return { ok: false, reason: 'invalid_signed_action' as const, payload };
  }

  const verification = verifyAgentAction({ signed: submission.signed, payload });
  if (!verification.ok) return { ok: false, reason: verification.reason, payload };

  const attestation: SealAttestation = {
    agent: submission.agent,
    verdict: submission.verdict,
    rationale: `[historical] ${submission.rationale}`,
    mii_at_attestation: submission.mii_at_attestation ?? null,
    gi_at_attestation: seal.gi_at_seal,
    timestamp: submission.signed.signed_at,
    signature: submission.signed.signature,
    posture: submission.agent === 'AUREA' ? submission.posture ?? seal.posture ?? 'cautionary' : undefined,
  };

  const sidecarWritten = await kvSet(
    historicalAttestationKey(submission.seal_id, submission.agent),
    attestation,
    HISTORICAL_ATTESTATION_TTL_SECONDS,
  );
  if (!sidecarWritten) return { ok: false, reason: 'historical_attestation_persistence_failed' as const, payload };

  const merged = await mergeHistoricalAttestationIntoSeal(submission.seal_id);
  if (!merged?.attestations?.[submission.agent]) {
    return { ok: false, reason: 'historical_attestation_merge_failed' as const, payload };
  }

  const consumed = await consumeDedupeKey({
    dedupe_key: submission.signed.dedupe_key,
    agent: submission.signed.agent,
    action: submission.signed.action,
    payload_hash: submission.signed.payload_hash,
  });
  if (!consumed.ok) return { ok: false, reason: 'error' in consumed ? consumed.error : 'dedupe_key_already_consumed', payload };

  const finalSeal = await mergeHistoricalAttestationIntoSeal(submission.seal_id) ?? merged;
  const missing = missingSentinelAgents(finalSeal);
  return {
    ok: true,
    reason: missing.length === 0 ? 'historical_quorum_complete' : 'historical_attestation_recorded',
    seal: finalSeal,
    payload,
    missing_agents: missing,
  };
}

export function historicalAttestationDigest(seal: Seal) {
  const payload = buildHistoricalAttestationPayload(seal);
  return {
    payload,
    payload_hash: hashPayload(payload),
    missing_agents: missingSentinelAgents(seal),
    canon: 'Historical attestation validates stored proof. It does not rewrite live history or unlock the Fountain by itself.',
  };
}
