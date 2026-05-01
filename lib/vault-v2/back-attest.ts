/**
 * Vault v2 — Back-attestation logic for quarantined reserve seals.
 *
 * Operators (or the sweep cron) use this to retroactively attest seals that
 * were finalized as quarantined because sentinel quorum was not assembled in
 * time. This does NOT rewrite history — it adds attestations to the stored
 * seal record and re-evaluates quorum. A seal that reaches quorum transitions
 * quarantined → attested and joins the canonical attested index.
 *
 * Quorum rules (mirror of evaluateQuorum in seal.ts):
 *   - ZEUS must pass
 *   - No non-ZEUS reject
 *   - At least VAULT_QUORUM_MIN_PASSES (4) total passes
 */

import { appendSealToChain, getSeal, writeSeal } from '@/lib/vault-v2/store';
import { attestReserveBlockToSubstrate, enqueueSubstrateRetry } from '@/lib/vault-v2/substrate-attestation';
import type { Seal, SealAttestation, SentinelAgent, Verdict } from '@/lib/vault-v2/types';
import { SENTINEL_AGENTS } from '@/lib/vault-v2/types';
import { VAULT_QUORUM_MIN_PASSES } from '@/lib/vault-v2/constants';

export type BackAttestInput = {
  seal_id: string;
  agent: SentinelAgent;
  verdict: Verdict;
  rationale: string;
  posture?: Seal['posture'];
};

export type BackAttestQuorum = {
  pass_count: number;
  needed: number;
  agents_voted: SentinelAgent[];
  agents_pending: SentinelAgent[];
  reached: boolean;
};

export type BackAttestResult =
  | {
      ok: true;
      seal_id: string;
      status: Seal['status'];
      quorum: BackAttestQuorum;
      transition: 'attested' | 'recorded' | 'already_attested';
    }
  | { ok: false; reason: string; seal_id: string };

function evaluateBackQuorum(attestations: Partial<Record<SentinelAgent, SealAttestation>>): {
  decision: 'attested' | 'quarantined' | 'waiting';
  quorum: BackAttestQuorum;
} {
  const voted = SENTINEL_AGENTS.filter((a) => Boolean(attestations[a]));
  const pending = SENTINEL_AGENTS.filter((a) => !attestations[a]);
  const passCount = SENTINEL_AGENTS.filter((a) => attestations[a]?.verdict === 'pass').length;
  const zeusPass = attestations.ZEUS?.verdict === 'pass';
  const anyNonZeusReject = SENTINEL_AGENTS.some(
    (a) => a !== 'ZEUS' && attestations[a]?.verdict === 'reject',
  );

  const quorum: BackAttestQuorum = {
    pass_count: passCount,
    needed: VAULT_QUORUM_MIN_PASSES,
    agents_voted: voted,
    agents_pending: pending,
    reached: zeusPass && passCount >= VAULT_QUORUM_MIN_PASSES && !anyNonZeusReject,
  };

  if (quorum.reached) return { decision: 'attested', quorum };
  if (pending.length > 0) return { decision: 'waiting', quorum };
  return { decision: 'quarantined', quorum };
}

export async function backAttestSeal(input: BackAttestInput): Promise<BackAttestResult> {
  const seal = await getSeal(input.seal_id);
  if (!seal) return { ok: false, reason: 'seal_not_found', seal_id: input.seal_id };

  if (seal.status === 'attested') {
    const { quorum } = evaluateBackQuorum(seal.attestations);
    return {
      ok: true,
      seal_id: input.seal_id,
      status: 'attested',
      quorum,
      transition: 'already_attested',
    };
  }

  const now = new Date().toISOString();
  const attestation: SealAttestation = {
    agent: input.agent,
    verdict: input.verdict,
    rationale: `[back-attest] ${input.rationale}`.slice(0, 2000),
    gi_at_attestation: seal.gi_at_seal,
    timestamp: now,
    signature: `back-attest::${input.agent}::${Date.now()}`,
    ...(input.agent === 'AUREA' && input.posture ? { posture: input.posture } : {}),
  };

  const updatedAttestations: Partial<Record<SentinelAgent, SealAttestation>> = {
    ...seal.attestations,
    [input.agent]: attestation,
  };

  const { decision, quorum } = evaluateBackQuorum(updatedAttestations);

  let updatedSeal: Seal = {
    ...seal,
    attestations: updatedAttestations,
    ...(input.agent === 'AUREA' && input.posture ? { posture: input.posture } : {}),
  };

  if (decision === 'attested') {
    const substrate = await attestReserveBlockToSubstrate(updatedSeal);
    const substrateError = substrate.ok ? null : (substrate.error ?? 'substrate_attestation_failed');
    updatedSeal = {
      ...updatedSeal,
      status: 'attested',
      substrate_attestation_id: substrate.entryId ?? null,
      substrate_event_hash: substrate.eventHash ?? substrate.entryId ?? null,
      substrate_attested_at: substrate.ok ? (substrate.attestedAt ?? now) : null,
      substrate_attestation_error: substrateError,
    };
    await appendSealToChain(updatedSeal);
    if (!substrate.ok) {
      // Substrate write failed — seal is attested in KV (authoritative); queue for retry.
      void enqueueSubstrateRetry(updatedSeal, substrateError ?? 'substrate_attestation_failed').catch(() => {});
      console.warn('[back-attest] substrate write failed; queued for retry', {
        seal_id: input.seal_id,
        error: substrateError,
      });
    }
    return { ok: true, seal_id: input.seal_id, status: 'attested', quorum, transition: 'attested' };
  }

  await writeSeal(updatedSeal);
  return {
    ok: true,
    seal_id: input.seal_id,
    status: updatedSeal.status,
    quorum,
    transition: 'recorded',
  };
}

export function buildBackAttestRationale(agent: SentinelAgent, seal_id: string): string {
  const cycle = seal_id.match(/seal-(C-\d+)/)?.[1] ?? 'unknown cycle';
  const map: Record<SentinelAgent, string> = {
    ATLAS:
      `ATLAS back-attestation: ${cycle} reserve block hash chain validated. ` +
      'Strategic coherence confirmed from historical stored record.',
    ZEUS:
      `ZEUS back-attestation: ${cycle} seal hash present, no reject condition. ` +
      'Chain continuity confirmed from stored proof.',
    EVE:
      `EVE back-attestation: ${cycle} governance review complete. ` +
      'Reserve block accumulation consistent with covenant constraints.',
    JADE:
      `JADE back-attestation: ${cycle} constitutional annotation. ` +
      'Block sealing aligns with reserve block canon.',
    AUREA:
      `AUREA back-attestation: ${cycle} strategic synthesis review. ` +
      'Reserve integrity confirmed from stored record.',
  };
  return map[agent];
}
