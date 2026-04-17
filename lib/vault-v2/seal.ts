/**
 * Seal lifecycle — candidate formation, hash computation, quorum evaluation,
 * mint/quarantine/reject transitions.
 *
 * Hash computation and quorum evaluation are pure. The only side-effecting
 * functions are formCandidate, finalizeSeal, and injectTimeouts, which are
 * called explicitly by the deposit path or the attestation cron.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
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

const ATTESTATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 min per spec §6

// ────────────────────────────────────────────────────────────────
// Hash chain
// ────────────────────────────────────────────────────────────────

type CanonicalFields = {
  seal_id: string;
  sequence: number;
  cycle_at_seal: string;
  sealed_at: string;
  reserve: 50;
  gi_at_seal: number;
  mode_at_seal: Mode;
  source_entries: number;
  deposit_hashes: string[];
  prev_seal_hash: string | null;
};

/**
 * Canonical serialization for hashing. Order matters — every field in this
 * exact order, no extras, no missing. Changing this shape breaks the chain.
 * Spec §7.
 */
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

/**
 * Verify a Seal's hash matches its declared fields. ZEUS uses this during
 * attestation to check cryptographic integrity.
 */
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

// ────────────────────────────────────────────────────────────────
// Attestation signatures
// ────────────────────────────────────────────────────────────────

/**
 * HMAC-SHA256(agent-specific Vault secret, seal_hash :: verdict :: rationale).
 *
 * Preferred envs:
 *   - VAULT_ATLAS_SECRET_TOKEN
 *   - VAULT_ZEUS_SECRET_TOKEN
 *   - VAULT_EVE_SECRET_TOKEN
 *   - VAULT_JADE_SECRET_TOKEN
 *   - VAULT_AUREA_SECRET_TOKEN
 *
 * Legacy fallback (when a per-sentinel secret is unset):
 *   - AGENT_SERVICE_TOKEN
 */
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

// ────────────────────────────────────────────────────────────────
// Candidate formation
// ────────────────────────────────────────────────────────────────

/**
 * Called by the deposit path when in_progress_balance crosses 50.
 * Creates a SealCandidate, persists it, and returns it for observation.
 *
 * Returns null if a candidate is already in flight — deposits queue until
 * the current candidate resolves (spec §11.3, chain continuity).
 */
export async function formCandidate(args: {
  cycle: string;
  gi_at_seal: number;
  mode_at_seal: Mode;
  source_entries: number;
  deposit_hashes: string[];
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
    reserve: 50,
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
    reserve: 50,
    gi_at_seal: args.gi_at_seal,
    mode_at_seal: args.mode_at_seal,
    source_entries: args.source_entries,
    deposit_hashes: args.deposit_hashes,
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

// ────────────────────────────────────────────────────────────────
// Quorum evaluation
// ────────────────────────────────────────────────────────────────

export type QuorumResult =
  | { decision: 'attested' }
  | { decision: 'quarantined'; reasons: string[] }
  | { decision: 'rejected'; rejecter: SentinelAgent; rationale: string }
  | { decision: 'waiting'; missing: SentinelAgent[] };

/**
 * Applies spec §6 quorum rules:
 *   - ZEUS reject → rejected (absolute)
 *   - All attestations present, ZEUS pass, ≥ 4 pass, no non-ZEUS reject → attested
 *   - All attestations present, otherwise → quarantined
 *   - Missing attestations → waiting
 *
 * Timeouts are injected by the cron as `flag: timeout` before this is called.
 */
export function evaluateQuorum(candidate: SealCandidate): QuorumResult {
  const attestations = candidate.attestations;

  const zeus = attestations.ZEUS;
  if (zeus?.verdict === 'reject') {
    return {
      decision: 'rejected',
      rejecter: 'ZEUS',
      rationale: zeus.rationale,
    };
  }

  const missing: SentinelAgent[] = [];
  for (const agent of SENTINEL_AGENTS) {
    if (!attestations[agent]) missing.push(agent);
  }
  if (missing.length > 0) {
    return { decision: 'waiting', missing };
  }

  if (zeus?.verdict !== 'pass') {
    return {
      decision: 'quarantined',
      reasons: ['ZEUS did not pass'],
    };
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
    return {
      decision: 'quarantined',
      reasons: nonZeusRejects.map((r) => `${r} rejected`),
    };
  }

  if (passes < 4) {
    return {
      decision: 'quarantined',
      reasons: [`only ${passes}/5 passes — quorum requires 4`],
    };
  }

  return { decision: 'attested' };
}

// ────────────────────────────────────────────────────────────────
// Seal finalization
// ────────────────────────────────────────────────────────────────

/**
 * Called by the attestation cron after quorum reaches a terminal state.
 * Promotes the candidate to a Seal (attested, quarantined, or rejected),
 * writes to KV, and clears the candidate slot so the next parcel can fill.
 *
 * Returns the finalized Seal, or null if no candidate exists or decision
 * is not terminal.
 */
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
    prev_seal_hash: candidate.prev_seal_hash,
    seal_hash: candidate.seal_hash,
    attestations: candidate.attestations,
    status,
    fountain_status: 'pending',
    fountain_emitted_at: null,
    posture: aurea?.posture ?? candidate.posture ?? null,
  };

  // Only attested seals join the chain; quarantined/rejected seals are
  // written but not appended to the index (they do not advance the chain).
  if (status === 'attested') {
    await appendSealToChain(seal);
  } else {
    await writeSeal(seal);
  }

  await clearCandidate();
  return seal;
}

// ────────────────────────────────────────────────────────────────
// Timeout injection
// ────────────────────────────────────────────────────────────────

/**
 * Cron-callable. For a candidate past its timeout_at with missing attestations,
 * inject `flag: timeout` for each missing agent so quorum can be evaluated.
 * Returns the updated candidate, or null if no candidate or not yet timed out.
 */
export async function injectTimeouts(now: number = Date.now()): Promise<SealCandidate | null> {
  const candidate = await getCandidate();
  if (!candidate) return null;
  if (new Date(candidate.timeout_at).getTime() > now) return null;

  const injected: Partial<Record<SentinelAgent, SealAttestation>> = { ...candidate.attestations };
  for (const agent of SENTINEL_AGENTS) {
    if (!injected[agent]) {
      const stamp: SealAttestation = {
        agent,
        verdict: 'flag',
        rationale: 'timeout',
        mii_at_attestation: 0,
        gi_at_attestation: 0,
        timestamp: new Date(now).toISOString(),
        signature: 'timeout',
      };
      injected[agent] = stamp;
    }
  }

  const next: SealCandidate = { ...candidate, attestations: injected };
  await writeCandidate(next);
  return next;
}

// ────────────────────────────────────────────────────────────────
// Convenience: counters for UI / ops surfaces
// ────────────────────────────────────────────────────────────────

export async function countAttestedSeals(): Promise<number> {
  // Index only contains attested seals (by design — see finalizeSeal).
  return (await listSealIds()).length;
}
