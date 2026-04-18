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
import { countAllSeals, countSeals, getCandidate, listSeals } from '@/lib/vault-v2/store';
import { evaluateQuorum, finalizeSeal, injectTimeouts } from '@/lib/vault-v2/seal';
import { tryFormNextCandidate } from '@/lib/vault-v2/deposit';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { resolveOperatorCycleId } from '@/lib/eve/resolve-operator-cycle';

export const dynamic = 'force-dynamic';

type CandidateState =
  | 'none'
  | 'forming-waiting'
  | 'timeout-injected'
  | 'finalized-attested'
  | 'finalized-quarantined'
  | 'finalized-rejected';

type Report = {
  ok: boolean;
  at: string;
  duration_ms: number;
  /** Cycle id passed to seal candidate formation (ECHO / tripwire / engine). */
  cycle_used: string;
  candidate_state: CandidateState;
  candidate_seal_id: string | null;
  attestations_received: number;
  next_candidate_formed: string | null;
  seals_total: number;
  seals_attested_total: number;
  seals_audit_total: number;
  fountain_pending_count: number;
  errors: string[];
};

export async function GET(req: NextRequest) {
  const cronHeader = req.headers.get('x-vercel-cron');
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || '';
  const manuallyAuthed = cronSecret !== '' && authHeader === `Bearer ${cronSecret}`;
  if (!cronHeader && !manuallyAuthed) {
    return NextResponse.json({ error: 'Cron-only endpoint' }, { status: 403 });
  }

  const started = Date.now();
  const errors: string[] = [];

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

  // ── Step 1: process existing candidate ─────────────────────────
  const candidate = await getCandidate();
  if (candidate) {
    candidate_seal_id = candidate.seal_id;
    attestations_received = Object.keys(candidate.attestations).length;

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
        console.info('[vault-v2:cron] seal finalized', {
          seal_id: sealed.seal_id,
          status: sealed.status,
          decision: quorum1.decision,
        });
      }
    } else {
      const timedOut = new Date(candidate.timeout_at).getTime() < Date.now();
      if (timedOut) {
        const injected = await injectTimeouts();
        if (injected) {
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
              console.info('[vault-v2:cron] seal finalized after timeout', {
                seal_id: sealed.seal_id,
                status: sealed.status,
              });
            }
          } else {
            candidate_state = 'timeout-injected';
          }
        }
      } else {
        candidate_state = 'forming-waiting';
      }
    }
  }

  // ── Step 2: attempt next candidate if reserve is queued ────────
  if (candidate_state !== 'forming-waiting' && candidate_state !== 'timeout-injected') {
    try {
      const next = await tryFormNextCandidate({ cycle: currentCycle });
      if (next) {
        next_candidate_formed = next.seal_id;
        console.info('[vault-v2:cron] next candidate formed', {
          seal_id: next.seal_id,
          sequence: next.sequence,
        });
      }
    } catch (e) {
      errors.push(`next-candidate formation: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── Step 3: fountain pending count (informational) ─────────────
  let fountain_pending_count = 0;
  let seals_total = 0;
  let seals_attested_total = 0;
  let seals_audit_total = 0;
  try {
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
  } catch (e) {
    errors.push(`seals list: ${e instanceof Error ? e.message : String(e)}`);
  }

  const report: Report = {
    ok: errors.length === 0,
    at: new Date().toISOString(),
    duration_ms: Date.now() - started,
    cycle_used: currentCycle,
    candidate_state,
    candidate_seal_id,
    attestations_received,
    next_candidate_formed,
    seals_total,
    seals_attested_total,
    seals_audit_total,
    fountain_pending_count,
    errors,
  };

  return NextResponse.json(report);
}
