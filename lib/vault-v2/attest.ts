/**
 * Per-Sentinel attestation logic.
 *
 * These functions are imported by Sentinel agents' own cycle paths. Each
 * agent, on its regular cycle tick, checks for an in-flight Seal candidate
 * and if present, evaluates it against its own tier-specific criteria and
 * submits an attestation via POST /api/vault/seal/attest.
 *
 * This module has no side effects and does not run on a schedule itself.
 * The caller owns the submission step.
 */

import { computeAttestationSignature } from '@/lib/vault-v2/seal';
import type { AttestationSubmission, Posture, SealCandidate, Verdict } from '@/lib/vault-v2/types';

// ────────────────────────────────────────────────────────────────
// ATLAS — Strategic coherence
// ────────────────────────────────────────────────────────────────

export type DepositAuthorship = Record<string, number>; // agent → count of deposits

export function atlasAttest(args: {
  candidate: SealCandidate;
  token: string;
  authorship: DepositAuthorship;
}): AttestationSubmission {
  const totalDeposits = Object.values(args.authorship).reduce((a, b) => a + b, 0);
  const agentCount = Object.keys(args.authorship).filter((a) => args.authorship[a] > 0).length;
  const maxShare =
    totalDeposits === 0 ? 0 : Math.max(...Object.values(args.authorship)) / totalDeposits;

  let verdict: Verdict = 'pass';
  let rationale: string;

  if (agentCount < 4) {
    verdict = 'flag';
    rationale = `Strategic coherence: only ${agentCount} distinct agents contributed to this Seal (threshold: 4). Flagging for diversity review.`;
  } else if (maxShare > 0.6) {
    verdict = 'flag';
    rationale = `Strategic coherence: single-agent concentration at ${(maxShare * 100).toFixed(0)}% of deposits (threshold: 60%). Flagging for balance review.`;
  } else {
    rationale = `Strategic coherence confirmed. ${agentCount} agents contributing, max concentration ${(maxShare * 100).toFixed(0)}%. Reasoning diversity within tolerance.`;
  }

  const signature = computeAttestationSignature({
    token: args.token,
    seal_hash: args.candidate.seal_hash,
    verdict,
    rationale,
  });

  return {
    seal_id: args.candidate.seal_id,
    agent: 'ATLAS',
    verdict,
    rationale,
    signature,
  };
}

// ────────────────────────────────────────────────────────────────
// ZEUS — Verification authority
// ────────────────────────────────────────────────────────────────

export function zeusAttest(args: {
  candidate: SealCandidate;
  token: string;
  hashChainValid: boolean;
  depositHashesValid: boolean;
  miiMathValid: boolean;
}): AttestationSubmission {
  const failures: string[] = [];
  if (!args.hashChainValid) failures.push('hash chain broken');
  if (!args.depositHashesValid) failures.push('deposit hashes unverified');
  if (!args.miiMathValid) failures.push('MII math inconsistent');

  let verdict: Verdict;
  let rationale: string;

  if (failures.length > 0) {
    verdict = 'reject';
    rationale = `Verification failed: ${failures.join('; ')}. Seal cannot mint — math does not hold.`;
  } else {
    verdict = 'pass';
    rationale = `Verification confirmed. Hash chain valid, deposit hashes verified against journal KV, MII weights computed correctly per v1 scoring formula.`;
  }

  const signature = computeAttestationSignature({
    token: args.token,
    seal_hash: args.candidate.seal_hash,
    verdict,
    rationale,
  });

  return {
    seal_id: args.candidate.seal_id,
    agent: 'ZEUS',
    verdict,
    rationale,
    signature,
  };
}

// ────────────────────────────────────────────────────────────────
// EVE — Ethical and civic clearance
// ────────────────────────────────────────────────────────────────

export function eveAttest(args: {
  candidate: SealCandidate;
  token: string;
  activeNarrativeTripwire: boolean;
  duplicationRate: number; // 0..1
  narrativeOverreachConfirmed: boolean;
}): AttestationSubmission {
  let verdict: Verdict = 'pass';
  let rationale: string;

  if (args.narrativeOverreachConfirmed) {
    verdict = 'reject';
    rationale = `Confirmed narrative-overreach within cycle window. Seal cannot mint under active civic-risk state.`;
  } else if (args.activeNarrativeTripwire) {
    verdict = 'flag';
    rationale = `Active EVE tripwire state at sealing — no confirmed violation but flagging for civic-risk review. Duplication rate: ${(args.duplicationRate * 100).toFixed(1)}%.`;
  } else if (args.duplicationRate > 0.35) {
    verdict = 'flag';
    rationale = `Elevated duplication rate at ${(args.duplicationRate * 100).toFixed(1)}% (threshold: 35%). Deposits within tolerance but flagging for pattern review.`;
  } else {
    rationale = `Ethical clearance confirmed. No active narrative tripwire, duplication rate ${(args.duplicationRate * 100).toFixed(1)}%, no overreach patterns detected.`;
  }

  const signature = computeAttestationSignature({
    token: args.token,
    seal_hash: args.candidate.seal_hash,
    verdict,
    rationale,
  });

  return {
    seal_id: args.candidate.seal_id,
    agent: 'EVE',
    verdict,
    rationale,
    signature,
  };
}

// ────────────────────────────────────────────────────────────────
// JADE — Constitutional framing
// ────────────────────────────────────────────────────────────────

export function jadeAttest(args: {
  candidate: SealCandidate;
  token: string;
  schemaValid: boolean;
  covenantRoutingValid: boolean;
  precedentConsistent: boolean;
}): AttestationSubmission {
  let verdict: Verdict = 'pass';
  let rationale: string;

  if (!args.schemaValid) {
    verdict = 'reject';
    rationale = `Schema violation detected. Seal structure does not conform to Vault v2 protocol §4.`;
  } else if (!args.covenantRoutingValid) {
    verdict = 'reject';
    rationale = `Covenant routing break. Agent ownership does not preserve constitutional framing.`;
  } else if (!args.precedentConsistent) {
    verdict = 'flag';
    rationale = `Precedent drift noted — Seal shape diverges from Seals [1..N-1] within tolerance. Flagging for JADE review.`;
  } else {
    rationale = `Constitutional framing confirmed. Schema matches v2 §4, covenant routing preserved, shape consistent with prior Seals.`;
  }

  const signature = computeAttestationSignature({
    token: args.token,
    seal_hash: args.candidate.seal_hash,
    verdict,
    rationale,
  });

  return {
    seal_id: args.candidate.seal_id,
    agent: 'JADE',
    verdict,
    rationale,
    signature,
  };
}

// ────────────────────────────────────────────────────────────────
// AUREA — Synthesis and posture
// ────────────────────────────────────────────────────────────────

/**
 * AUREA does not pass/fail/reject. It always submits `pass` with a posture
 * stamp that influences later Fountain emission weighting.
 *
 * Posture rubric:
 *   - GI >= 0.88 AND mode green → confident
 *   - GI >= 0.74 AND mode yellow → cautionary
 *   - GI >= 0.60 AND mode yellow → stressed
 *   - GI < 0.60 OR mode red → degraded
 */
export function aureaAttest(args: {
  candidate: SealCandidate;
  token: string;
}): AttestationSubmission {
  const { gi_at_seal, mode_at_seal } = args.candidate;
  let posture: Posture;
  if (gi_at_seal >= 0.88 && mode_at_seal === 'green') {
    posture = 'confident';
  } else if (gi_at_seal >= 0.74 && mode_at_seal === 'yellow') {
    posture = 'cautionary';
  } else if (gi_at_seal >= 0.6 && mode_at_seal === 'yellow') {
    posture = 'stressed';
  } else {
    posture = 'degraded';
  }

  const rationale = `Posture at sealing: ${posture}. GI ${gi_at_seal.toFixed(2)}, mode ${mode_at_seal}. This Seal's future Fountain behavior will be weighted by this posture — see Vault v2 §9.`;

  const verdict: Verdict = 'pass';
  const signature = computeAttestationSignature({
    token: args.token,
    seal_hash: args.candidate.seal_hash,
    verdict,
    rationale,
  });

  return {
    seal_id: args.candidate.seal_id,
    agent: 'AUREA',
    verdict,
    rationale,
    signature,
    posture,
  };
}
