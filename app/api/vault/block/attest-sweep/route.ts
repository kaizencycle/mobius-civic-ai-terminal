/**
 * GET /api/vault/block/attest-sweep
 *
 * Cron-driven back-attestation sweep (schedule: every 6h in vercel.json).
 * Finds all quarantined seals with missing sentinel attestations and submits
 * council votes from each agent that hasn't yet attested. Stops voting on a
 * seal as soon as quorum is reached.
 *
 * Auth: x-vercel-cron header (Vercel platform) OR Authorization: Bearer $CRON_SECRET.
 * In dev (no CRON_SECRET set) the endpoint is open.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { bearerMatchesToken } from '@/lib/vault-v2/auth';
import { backAttestSeal, buildBackAttestRationale } from '@/lib/vault-v2/back-attest';
import { listAllSeals, getSeal } from '@/lib/vault-v2/store';
import { SENTINEL_AGENTS } from '@/lib/vault-v2/types';
import {
  attestReserveBlockToSubstrate,
  dequeueSubstrateRetry,
  loadSubstrateRetryQueue,
} from '@/lib/vault-v2/substrate-attestation';
import { writeSeal } from '@/lib/vault-v2/store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron')) return true;
  const secret = process.env.CRON_SECRET ?? '';
  if (!secret) return true;
  return bearerMatchesToken(req.headers.get('authorization'), secret);
}

type SealSweepResult = {
  seal_id: string;
  sequence: number;
  votes_submitted: number;
  transition: string;
  final_status: string;
  error?: string;
};

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const seals = await listAllSeals(100);
  const candidates = seals.filter(
    (s) => s.status === 'quarantined' || s.status === 'forming',
  );

  const results: SealSweepResult[] = [];

  for (const seal of candidates) {
    const result: SealSweepResult = {
      seal_id: seal.seal_id,
      sequence: seal.sequence,
      votes_submitted: 0,
      transition: 'none',
      final_status: seal.status,
    };

    for (const agent of SENTINEL_AGENTS) {
      if (seal.attestations[agent]) continue; // already attested — skip

      try {
        const r = await backAttestSeal({
          seal_id: seal.seal_id,
          agent,
          verdict: 'pass',
          rationale: buildBackAttestRationale(agent, seal.seal_id),
          posture: agent === 'AUREA' ? 'cautionary' : undefined,
        });

        if (r.ok) {
          result.votes_submitted += 1;
          result.transition = r.transition;
          result.final_status = r.status;
          if (r.transition === 'attested') break; // quorum reached — stop voting
        } else {
          result.error = r.reason;
          break;
        }
      } catch (err) {
        result.error = err instanceof Error ? err.message : 'unknown_error';
        break;
      }
    }

    results.push(result);
  }

  const attestedCount = results.filter((r) => r.final_status === 'attested').length;
  const errorCount = results.filter((r) => Boolean(r.error)).length;
  const totalVotes = results.reduce((s, r) => s + r.votes_submitted, 0);

  // Drain substrate retry queue — retry substrate writes for seals that attested
  // in KV but whose substrate write failed at finalization time.
  const retryQueue = await loadSubstrateRetryQueue();
  const retryResults: Array<{ seal_id: string; ok: boolean; error?: string }> = [];
  for (const entry of retryQueue) {
    try {
      const seal = await getSeal(entry.seal_id);
      if (!seal || seal.status !== 'attested') {
        await dequeueSubstrateRetry(entry.seal_id);
        continue;
      }
      if (seal.substrate_attestation_id) {
        // Already has a substrate ID from a previous retry
        await dequeueSubstrateRetry(entry.seal_id);
        retryResults.push({ seal_id: entry.seal_id, ok: true });
        continue;
      }
      const substrate = await attestReserveBlockToSubstrate(seal);
      if (substrate.ok) {
        await writeSeal({
          ...seal,
          substrate_attestation_id: substrate.entryId ?? null,
          substrate_event_hash: substrate.eventHash ?? substrate.entryId ?? null,
          substrate_attested_at: substrate.attestedAt ?? new Date().toISOString(),
          substrate_attestation_error: null,
        });
        await dequeueSubstrateRetry(entry.seal_id);
        retryResults.push({ seal_id: entry.seal_id, ok: true });
      } else {
        retryResults.push({ seal_id: entry.seal_id, ok: false, error: substrate.error });
      }
    } catch (err) {
      retryResults.push({
        seal_id: entry.seal_id,
        ok: false,
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    duration_ms: Date.now() - started,
    seals_swept: candidates.length,
    results,
    substrate_retries: {
      queued: retryQueue.length,
      retried: retryResults.length,
      resolved: retryResults.filter((r) => r.ok).length,
      still_failing: retryResults.filter((r) => !r.ok).length,
      results: retryResults,
    },
    summary: {
      attested: attestedCount,
      still_quarantined: results.filter((r) => r.final_status === 'quarantined').length,
      errors: errorCount,
      total_votes_submitted: totalVotes,
    },
  });
}
