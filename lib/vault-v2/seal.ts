/**
 * Seal lifecycle — candidate formation, hash computation, quorum evaluation,
 * mint/quarantine/reject transitions.
 *
 * Hash computation and quorum evaluation are pure. The only side-effecting
 * functions are formCandidate, finalizeSeal, and injectTimeouts, which are
 * called explicitly by the deposit path or the attestation cron.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { attestReserveBlockToSubstrate } from '@/lib/vault-v2/substrate-attestation';
import { releaseReplayPressureForAttestedSeal } from '@/lib/mic/replayPressure';
import {
  appendSealToAuditChain,
  appendSealToChain,
  clearCandidate,
  getCandidate,
  getLatestSeal,
  listSealIds,
  writeCandidate,
  writeSeal,
} from '@/lib/vault-v2/store';
import type {
  AttestationSubmission,
  Mode,
  Seal,
  SealAttestation,
  SealCandidate,
  SentinelAgent,
  Verdict,
} from '@/lib/vault-v2/types';
import { SENTINEL_AGENTS } from '@/lib/vault-v2/types';
import { VAULT_QUORUM_MIN_PASSES, VAULT_RESERVE_PARCEL_UNITS } from '@/lib/vault-v2/constants';

const ATTESTATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 min per spec §6

type CanonicalFields = {
  seal_id: string;
  sequence: number;
  cycle_at_seal: string;
  sealed_at: string;
  reserve: typeof VAULT_RESERVE_PARCEL_UNITS;
  gi_at_seal: number;
  mode_at_seal: Mode;
  source_entries: number;
  deposit_hashes: string[];
  prev_seal_hash: string | null;
};

function canonicalize(fields: CanonicalFields): string {
  return JSON.stringify([
    fields.seal_id,
    fields.sequence,
    fields.cycle_at_seal,
    fields.sealed_at,
    fields.reserve,
    Number(fields.gi_at_seal.toFixed(6)),
    fields.mode_at_seal,
    fields.source_entries,
    [...fields.deposit_hashes].sort(),
    fields.prev_seal_hash,
  ]);
}

export function computeSealHash(fields: CanonicalFields): string {
  return createHash('sha256').update(canonicalize(fields)).digest('hex');
}

export function verifySealHash(seal: Seal): boolean {
  const recomputed = computeSealHash({
    seal_id: seal.seal_id,
    sequence: seal.sequence,
    cycle_at_seal: seal.cycle_at_seal,
    sealed_at: seal.sealed_at,
    reserve: seal.reserve,
    gi_at_seal: seal.gi_at_seal,
    mode_at_seal: seal.mode_at_seal,
    source_entries: seal.source_entries,
    deposit_hashes: seal.deposit_hashes,
    prev_seal_hash: seal.prev_seal_hash,
  });
  return recomputed === seal.seal_hash;
}

export function computeAttestationSignature(args: {
  token: string;
  seal_hash: string;
  verdict: Verdict;
  rationale: string;
}): string {
  const payload = `${args.seal_hash}::${args.verdict}::${args.rationale}`;
  return createHmac('sha256', args.token).update(payload).digest('hex');
}

export function verifyAttestationSignature(
  token: string,
  submission: AttestationSubmission,
  seal_hash: string,
): boolean {
  const expected = computeAttestationSignature({
    token,
    seal_hash,
    verdict: submission.verdict,
    rationale: submission.rationale,
  });
  if (expected.length !== submission.signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(submission.signature, 'hex'));
  } catch {
    return false;
  }
}

export async function formCandidate(args: {
  cycle: string;
  gi_at_seal: number;
  mode_at_seal: Mode;
  source_entries: number;
  deposit_hashes: string[];
  carried_forward_deposit_hashes?: string[];
}): Promise<SealCandidate | null> {
  const existing = await getCandidate();
  if (existing) return null;

  const prevSeal = await getLatestSeal();
  const sequence = (prevSeal?.sequence ?? 0) + 1;
  const prev_seal_hash = prevSeal?.seal_hash ?? null;
  const sealed_at = new Date().toISOString();
  const seal_id = formatSealId(args.cycle, sequence);

  const seal_hash = computeSealHash({
    seal_id,
    sequence,
    cycle_at_seal: args.cycle,
    sealed_at,
    reserve: VAULT_RESERVE_PARCEL_UNITS,
    gi_at_seal: args.gi_at_seal,
    mode_at_seal: args.mode_at_seal,
    source_entries: args.source_entries,
    deposit_hashes: args.deposit_hashes,
    prev_seal_hash,
  });

  const requested_at = sealed_at;
  const timeout_at = new Date(Date.now() + ATTESTATION_TIMEOUT_MS).toISOString();

  const candidate: SealCandidate = {
    seal_id,
    sequence,
    cycle_at_seal: args.cycle,
    sealed_at,
    reserve: VAULT_RESERVE_PARCEL_UNITS,
    gi_at_seal: args.gi_at_seal,
    mode_at_seal: args.mode_at_seal,
    source_entries: args.source_entries,
    deposit_hashes: args.deposit_hashes,
    ...(args.carried_forward_deposit_hashes?.length
      ? { carried_forward_deposit_hashes: [...args.carried_forward_deposit_hashes] }
      : {}),
    prev_seal_hash,
    seal_hash,
    attestations: {},
    posture: null,
    requested_at,
    timeout_at,
    status: 'forming',
  };

  await writeCandidate(candidate);
  return candidate;
}

function formatSealId(cycle: string, sequence: number): string {
  const paddedSeq = String(sequence).padStart(3, '0');
  return `seal-${cycle}-${paddedSeq}`;
}

export type QuorumResult =
  | { decision: 'attested' }
  | { decision: 'quarantined'; reasons: string[] }
  | { decision: 'rejected'; rejecter: SentinelAgent; rationale: string }
  | { decision: 'waiting'; missing: SentinelAgent[] };

export function evaluateQuorum(candidate: SealCandidate): QuorumResult {
  const attestations = candidate.attestations;

  const zeus = attestations.ZEUS;
  if (zeus?.verdict === 'reject') {
    return { decision: 'rejected', rejecter: 'ZEUS', rationale: zeus.rationale };
  }

  const missing: SentinelAgent[] = [];
  for (const agent of SENTINEL_AGENTS) {
    if (!attestations[agent]) missing.push(agent);
  }
  if (missing.length > 0) return { decision: 'waiting', missing };

  if (zeus?.verdict !== 'pass') {
    return { decision: 'quarantined', reasons: ['ZEUS did not pass'] };
  }

  let passes = 0;
  const nonZeusRejects: SentinelAgent[] = [];
  for (const agent of SENTINEL_AGENTS) {
    const a = attestations[agent];
    if (!a) continue;
    if (a.verdict === 'pass') passes += 1;
    if (agent !== 'ZEUS' && a.verdict === 'reject') nonZeusRejects.push(agent);
  }

  if (nonZeusRejects.length > 0) {
    return { decision: 'quarantined', reasons: nonZeusRejects.map((r) => `${r} rejected`) };
  }
  if (passes < VAULT_QUORUM_MIN_PASSES) {
    return {
      decision: 'quarantined',
      reasons: [`only ${passes}/${SENTINEL_AGENTS.length} passes — quorum requires ${VAULT_QUORUM_MIN_PASSES}`],
    };
  }

  return { decision: 'attested' };
}

export async function finalizeSeal(decision: QuorumResult): Promise<Seal | null> {
  const candidate = await getCandidate();
  if (!candidate) return null;

  let status: Seal['status'];
  switch (decision.decision) {
    case 'attested':
      status = 'attested';
      break;
    case 'quarantined':
      status = 'quarantined';
      break;
    case 'rejected':
      status = 'rejected';
      break;
    case 'waiting':
      return null;
  }

  const aurea = candidate.attestations.AUREA;
  const seal: Seal = {
    seal_id: candidate.seal_id,
    sequence: candidate.sequence,
    cycle_at_seal: candidate.cycle_at_seal,
    sealed_at: candidate.sealed_at,
    reserve: candidate.reserve,
    gi_at_seal: candidate.gi_at_seal,
    mode_at_seal: candidate.mode_at_seal,
    source_entries: candidate.source_entries,
    deposit_hashes: candidate.deposit_hashes,
    ...(candidate.carried_forward_deposit_hashes?.length
      ? { carried_forward_deposit_hashes: [...candidate.carried_forward_deposit_hashes] }
      : {}),
    prev_seal_hash: candidate.prev_seal_hash,
    seal_hash: candidate.seal_hash,
    attestations: candidate.attestations,
    status,
    fountain_status: 'pending',
    fountain_emitted_at: null,
    posture: aurea?.posture ?? candidate.posture ?? null,
    substrate_attestation_id: null,
    substrate_event_hash: null,
    substrate_attested_at: null,
    substrate_attestation_error: null,
  };

  let finalized = seal;
  if (status === 'attested') {
    const substrate = await attestReserveBlockToSubstrate(seal);
    finalized = {
      ...seal,
      substrate_attestation_id: substrate.entryId ?? null,
      substrate_event_hash: substrate.eventHash ?? substrate.entryId ?? null,
      substrate_attested_at: substrate.ok ? (substrate.attestedAt ?? new Date().toISOString()) : null,
      substrate_attestation_error: substrate.ok ? null : (substrate.error ?? 'substrate_attestation_failed'),
    };
    await appendSealToChain(finalized);
    // OPT-10 (C-296): relieve replay pressure for each attested seal. Six quarantined
    // seals pushed replay_pressure to 0.345; each successful attestation subtracts ~0.057.
    void releaseReplayPressureForAttestedSeal().catch(() => {});
  } else {
    await writeSeal(finalized);
    await appendSealToAuditChain(finalized);
  }

  await clearCandidate();
  return finalized;
}

export async function injectTimeouts(now: number = Date.now()): Promise<SealCandidate | null> {
  const candidate = await getCandidate();
  if (!candidate) return null;
  if (new Date(candidate.timeout_at).getTime() > now) return null;

  const injected: Partial<Record<SentinelAgent, SealAttestation>> = { ...candidate.attestations };
  for (const agent of SENTINEL_AGENTS) {
    if (!injected[agent]) {
      injected[agent] = {
        agent,
        verdict: 'flag',
        rationale: 'timeout',
        gi_at_attestation: candidate.gi_at_seal,
        timestamp: new Date(now).toISOString(),
        signature: 'timeout',
      };
    }
  }

  const next: SealCandidate = { ...candidate, attestations: injected };
  await writeCandidate(next);
  return next;
}

export async function countAttestedSeals(): Promise<number> {
  return (await listSealIds()).length;
}
