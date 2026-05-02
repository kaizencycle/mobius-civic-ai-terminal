/**
 * /api/cron/vault-attestation
 *
 * Runs every 2 minutes. Orchestrates the Seal ceremony:
 *
 *   1. If a candidate exists:
 *      a. If all 5 attestations collected → evaluate quorum → finalize
 *      b. If timeout_at passed → inject `flag: timeout` for missing agents
 *         → re-evaluate quorum → finalize
 *      c. Otherwise → waiting (cron returns, Sentinel agents are expected
 *         to poll for candidates on their own cycle ticks)
 *
 *   2. If no candidate exists and in_progress_balance >= 50 (queued reserve
 *      from deferred deposits), form the next candidate.
 *
 *   3. For each attested Seal in `pending` fountain status, count them for
 *      report. Full Fountain emission is v2.1 territory.
 *
 *   4. Emit a summary report for /api/terminal/snapshot to surface in the
 *      Vault lane.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { Seal } from '@/lib/vault-v2/types';
import {
  countAllSeals,
  countSeals,
  getCandidate,
  getInProgressBalance,
  listAllSeals,
  listSeals,
} from '@/lib/vault-v2/store';
import { evaluateQuorum, finalizeSeal, injectTimeouts } from '@/lib/vault-v2/seal';
import { tryFormNextCandidate } from '@/lib/vault-v2/deposit';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { resolveOperatorCycleId } from '@/lib/eve/resolve-operator-cycle';
import { VAULT_RESERVE_PARCEL_UNITS } from '@/lib/vault-v2/constants';
import { bearerMatchesToken } from '@/lib/vault-v2/auth';
import { backAttestSeal, buildBackAttestRationale } from '@/lib/vault-v2/back-attest';
import { SENTINEL_AGENTS } from '@/lib/vault-v2/types';
import { releaseReplayPressureForAttestedSeal } from '@/lib/mic/replayPressure';
import {
  registerSentinelAttestation,
  SENTINEL_QUORUM_AGENTS,
  type SentinelQuorumAgent,
  type SentinelQuorumState,
} from '@/lib/mic/quorumTracker';

export const dynamic = 'force-dynamic';

type CandidateState =
  | 'none'
  | 'forming-waiting'
  | 'timeout-injected'
  | 'finalized-attested'
  | 'finalized-quarantined'
  | 'finalized-rejected';

type QuarantinedSealDigest = {
  seal_id: string;
  sequence: number;
  missing_agents: string[];
};

type Report = {
  ok: boolean;
  at: string;
  duration_ms: number;
  /** Cycle id passed to seal candidate formation (ECHO / tripwire / engine). */
  cycle_used: string;
  candidate_state: CandidateState;
  candidate_seal_id: string | null;
  attestations_received: number;
  /** C-299: Sentinel quorum state written from vault-attestation cron. */
  sentinel_quorum_received: number;
  sentinel_quorum_status: SentinelQuorumState['status'] | null;
  sentinel_quorum_agents: SentinelQuorumAgent[];
  next_candidate_formed: string | null;
  in_progress_balance: number;
  threshold: typeof VAULT_RESERVE_PARCEL_UNITS;
  auto_seal_reason: string;
  seals_total: number;
  seals_attested_total: number;
  seals_audit_total: number;
  seals_quarantined_total: number;
  quarantined_needing_reattestation: QuarantinedSealDigest[];
  fountain_pending_count: number;
  errors: string[];
};

function isSentinelQuorumAgent(agent: string): agent is SentinelQuorumAgent {
  return (SENTINEL_QUORUM_AGENTS as readonly string[]).includes(agent);
}

function readAttestationConfidence(attestation: unknown): number {
  const maybe = attestation as { confidence?: unknown } | null;
  const confidence = typeof maybe?.confidence === 'number' ? maybe.confidence : 0.75;
  return Math.max(0, Math.min(1, confidence));
}

export async function GET(req: NextRequest) {
  const cronHeader = req.headers.get('x-vercel-cron');
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || '';
  // FIX-2 (C-293): use timingSafeEqual via bearerMatchesToken
  const manuallyAuthed = bearerMatchesToken(authHeader, cronSecret);
  if (!cronHeader && !manuallyAuthed) {
    return NextResponse.json({ error: 'Cron-only endpoint' }, { status: 403 });
  }

  const started = Date.now();
  const errors: string[] = [];
  const inProgressBalanceStart = await getInProgressBalance();
  let autoSealReason = inProgressBalanceStart >= VAULT_RESERVE_PARCEL_UNITS
    ? 'canonical_v2_balance_ready'
    : 'canonical_v2_balance_below_threshold';

  let currentCycle: string;
  try {
    currentCycle = await resolveOperatorCycleId();
  } catch (e) {
    errors.push(`cycle load failed: ${e instanceof Error ? e.message : String(e)}`);
    currentCycle = currentCycleId();
  }

  let candidate_state: CandidateState = 'none';
  let candidate_seal_id: string | null = null;
  let attestations_received = 0;
  let next_candidate_formed: string | null = null;
  let sentinelQuorumState: SentinelQuorumState | null = null;
  const sentinelQuorumAgents = new Set<SentinelQuorumAgent>();

  async function recordSentinelQuorum(agent: string, confidence: number, source: string): Promise<void> {
    if (!isSentinelQuorumAgent(agent)) return;
    try {
      sentinelQuorumState = await registerSentinelAttestation(currentCycle, agent, confidence, source);
      sentinelQuorumAgents.add(agent);
      console.info('[vault-v2:cron] sentinel quorum registered', {
        cycle: currentCycle,
        agent,
        confidence,
        source,
        received: sentinelQuorumState.attestations_received,
        status: sentinelQuorumState.status,
      });
    } catch (e) {
      errors.push(`sentinel-quorum ${agent}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── Step 1: process existing candidate ─────────────────────────
  const candidate = await getCandidate();
  if (candidate) {
    candidate_seal_id = candidate.seal_id;
    attestations_received = Object.keys(candidate.attestations).length;
    autoSealReason = 'candidate_in_flight_waiting_for_quorum_or_timeout';

    // C-299 P0: mirror seal attestations into the Sentinel quorum tracker.
    // This keeps `/api/cron/vault-attestation` from returning 200 OK while
    // `mic:quorum:<cycle>` remains empty.
    await Promise.all(
      Object.entries(candidate.attestations).map(([agent, attestation]) =>
        recordSentinelQuorum(agent, readAttestationConfidence(attestation), 'vault-candidate-attestation'),
      ),
    );

    const quorum1 = evaluateQuorum(candidate);
    if (quorum1.decision !== 'waiting') {
      const sealed = await finalizeSeal(quorum1);
      if (sealed) {
        candidate_state =
          quorum1.decision === 'attested'
            ? 'finalized-attested'
            : quorum1.decision === 'quarantined'
              ? 'finalized-quarantined'
              : 'finalized-rejected';
        autoSealReason = `candidate_finalized_${sealed.status}`;
        console.info('[vault-v2:cron] seal finalized', {
          seal_id: sealed.seal_id,
          status: sealed.status,
          decision: quorum1.decision,
          // OPT-3 (C-293): surface substrate error in cron logs
          substrate_error: sealed.substrate_attestation_error ?? null,
        });
      } else {
        // null means another cron/manual invocation raced and already finalized+cleared
        // the candidate. Benign race — log for visibility but don't mark report ok: false.
        console.warn('[vault-v2:cron] finalizeSeal returned null (likely race)', {
          decision: quorum1.decision,
          seal_id: candidate.seal_id,
        });
      }
    } else {
      const timedOut = new Date(candidate.timeout_at).getTime() < Date.now();
      if (timedOut) {
        const injected = await injectTimeouts();
        if (injected) {
          await Promise.all(
            Object.entries(injected.attestations).map(([agent, attestation]) =>
              recordSentinelQuorum(agent, readAttestationConfidence(attestation), 'vault-timeout-injection'),
            ),
          );
          const quorum2 = evaluateQuorum(injected);
          if (quorum2.decision !== 'waiting') {
            const sealed = await finalizeSeal(quorum2);
            if (sealed) {
              candidate_state =
                quorum2.decision === 'attested'
                  ? 'finalized-attested'
                  : quorum2.decision === 'quarantined'
                    ? 'finalized-quarantined'
                    : 'finalized-rejected';
              autoSealReason = `candidate_finalized_after_timeout_${sealed.status}`;
              console.info('[vault-v2:cron] seal finalized after timeout', {
                seal_id: sealed.seal_id,
                status: sealed.status,
              });
            }
          } else {
            candidate_state = 'timeout-injected';
            autoSealReason = 'timeout_injected_but_quorum_still_waiting';
          }
        }
      } else {
        candidate_state = 'forming-waiting';
        autoSealReason = `candidate_waiting_for_${quorum1.missing.length}_attestations`;
        // OPT-4 (C-293): log missing agents + ms-to-timeout
        console.info('[vault-v2:cron] waiting for attestations', {
          seal_id: candidate.seal_id, missing: quorum1.missing,
          ms_to_timeout: Math.max(0, new Date(candidate.timeout_at).getTime() - Date.now()),
        });
      }
    }
  }

  // ── Step 2: attempt next candidate if reserve is queued ────────
  if (candidate_state !== 'forming-waiting' && candidate_state !== 'timeout-injected') {
    try {
      const next = await tryFormNextCandidate({ cycle: currentCycle });
      if (next) {
        next_candidate_formed = next.seal_id;
        autoSealReason = 'candidate_formed_from_canonical_v2_balance';
        console.info('[vault-v2:cron] next candidate formed', {
          seal_id: next.seal_id,
          sequence: next.sequence,
        });
      } else if (inProgressBalanceStart >= VAULT_RESERVE_PARCEL_UNITS) {
        autoSealReason = 'candidate_not_formed_despite_threshold_check_candidate_or_store';
      }
    } catch (e) {
      errors.push(`next-candidate formation: ${e instanceof Error ? e.message : String(e)}`);
      autoSealReason = 'candidate_formation_error';
    }
  }

  // ── Step 3: fountain pending count + quarantined reattestation ────
  // C-298 FIX: vaultIdle previously skipped back-attestation entirely when balance
  // was below the 50-MIC threshold. Quarantined seals must be retried regardless
  // of current balance — they are historical seals, not new candidates.
  // The idle fast-path now only skips the fountain/attested count reads; the
  // quarantined-seal scan always runs so back-attestation can clear the backlog.
  let fountain_pending_count = 0;
  let seals_total = 0;
  let seals_attested_total = 0;
  let seals_audit_total = 0;
  let seals_quarantined_total = 0;
  let quarantined_needing_reattestation: QuarantinedSealDigest[] = [];

  const vaultIdle =
    candidate_state === 'none' &&
    next_candidate_formed === null &&
    inProgressBalanceStart < VAULT_RESERVE_PARCEL_UNITS;

  // Always scan for quarantined seals — back-attestation must run even when idle.
  const shouldScanAll = !vaultIdle;
  {
    const SENTINEL_NAMES = ['ATLAS', 'ZEUS', 'EVE', 'JADE', 'AUREA'] as const;

    try {
      // allSeals always fetched so quarantined back-attestation runs even when idle.
      const allSeals = await listAllSeals(200);
      const quarantined = allSeals.filter((s: Seal) => s.status === 'quarantined');
      seals_quarantined_total = quarantined.length;
      quarantined_needing_reattestation = quarantined.map((s: Seal) => ({
        seal_id: s.seal_id,
        sequence: s.sequence,
        missing_agents: SENTINEL_NAMES.filter((a) => !s.attestations[a]),
      }));

      // Full attested/fountain counts only when not idle (KV read budget).
      if (shouldScanAll) {
        const [seals, attestedCount, auditCount] = await Promise.all([
          listSeals(200),
          countSeals(),
          countAllSeals(),
        ]);
        seals_total = seals.length;
        seals_attested_total = attestedCount;
        seals_audit_total = auditCount;
        fountain_pending_count = seals.filter(
          (s: Seal) => s.status === 'attested' && s.fountain_status === 'pending',
        ).length;
      }

      // Back-attest quarantined seals whenever no candidate is forming.
      // C-298: runs regardless of vaultIdle so historical seals can clear.
      if (quarantined_needing_reattestation.length > 0 && candidate_state !== 'forming-waiting') {
        for (const sealDigest of quarantined_needing_reattestation) {
          for (const agent of SENTINEL_AGENTS) {
            const sealObj = quarantined.find((s: Seal) => s.seal_id === sealDigest.seal_id);
            if (!sealObj || sealObj.attestations[agent]) continue;
            try {
              const r = await backAttestSeal({
                seal_id: sealDigest.seal_id,
                agent,
                verdict: 'pass',
                rationale: buildBackAttestRationale(agent, sealDigest.seal_id),
                posture: agent === 'AUREA' ? 'cautionary' : undefined,
              });
              if (r.ok) {
                await recordSentinelQuorum(agent, 0.75, 'vault-back-attestation');
              }
              if (r.ok && r.transition === 'attested') {
                void releaseReplayPressureForAttestedSeal().catch(() => {});
                console.info('[vault-v2:cron] back-attest transition → attested', {
                  seal_id: sealDigest.seal_id,
                  agent,
                });
                break;
              }
            } catch (e) {
              errors.push(`back-attest ${sealDigest.seal_id}/${agent}: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
        }
      }
    } catch (e) {
      errors.push(`seals list: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const report: Report = {
    ok: errors.length === 0,
    at: new Date().toISOString(),
    duration_ms: Date.now() - started,
    cycle_used: currentCycle,
    candidate_state,
    candidate_seal_id,
    attestations_received,
    sentinel_quorum_received: sentinelQuorumState?.attestations_received ?? 0,
    sentinel_quorum_status: sentinelQuorumState?.status ?? null,
    sentinel_quorum_agents: [...sentinelQuorumAgents],
    next_candidate_formed,
    in_progress_balance: await getInProgressBalance(),
    threshold: VAULT_RESERVE_PARCEL_UNITS,
    auto_seal_reason: autoSealReason,
    seals_total,
    seals_attested_total,
    seals_audit_total,
    seals_quarantined_total,
    quarantined_needing_reattestation,
    fountain_pending_count,
    errors,
  };

  return NextResponse.json(report);
}
