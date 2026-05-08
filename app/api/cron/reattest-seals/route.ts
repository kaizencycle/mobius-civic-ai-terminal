/**
 * GET /api/cron/reattest-seals
 *
 * Hourly cron that explicitly drives back-attestation for every quarantined seal.
 * Complements the per-2-minute vault-attestation cron which can miss seals when
 * vault is below the formation threshold (vaultIdle path).
 *
 * Safe to run multiple times — backAttestSeal is idempotent per agent per seal.
 * Logs a full digest per run for observability.
 *
 * Schedule: 0 * * * * (hourly)
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { bearerMatchesToken } from '@/lib/vault-v2/auth';
import { listAllSeals, writeSeal } from '@/lib/vault-v2/store';
import { backAttestSeal, buildBackAttestRationale } from '@/lib/vault-v2/back-attest';
import { attestReserveBlockToSubstrate } from '@/lib/vault-v2/substrate-attestation';
import { SENTINEL_AGENTS } from '@/lib/vault-v2/types';
import { releaseReplayPressureForAttestedSeal } from '@/lib/mic/replayPressure';
import { kvGet, kvSet } from '@/lib/kv/store';
import type { Seal } from '@/lib/vault-v2/types';

export const dynamic = 'force-dynamic';

// ── Exponential backoff helpers ────────────────────────────────────────────

async function shouldSkipRetry(sealId: string): Promise<boolean> {
  const attempts = (await kvGet<number>(`seal:${sealId}:reattest_attempts`)) ?? 0;
  const lastAttempt = await kvGet<string>(`seal:${sealId}:reattest_last_attempt`);
  if (!lastAttempt || attempts === 0) return false;
  // Exponential backoff: 5m, 10m, 20m, 40m, cap at 2h
  const backoffMs = Math.min(5 * 60 * 1000 * Math.pow(2, attempts - 1), 2 * 60 * 60 * 1000);
  const elapsed = Date.now() - new Date(lastAttempt).getTime();
  return elapsed < backoffMs;
}

async function recordReattestAttempt(sealId: string): Promise<void> {
  const attempts = (await kvGet<number>(`seal:${sealId}:reattest_attempts`)) ?? 0;
  await kvSet(`seal:${sealId}:reattest_attempts`, attempts + 1);
  await kvSet(`seal:${sealId}:reattest_last_attempt`, new Date().toISOString());
}

export async function GET(req: NextRequest) {
  const cronHeader = req.headers.get('x-vercel-cron');
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET ?? '';
  const manuallyAuthed = bearerMatchesToken(authHeader, cronSecret);

  if (!cronHeader && !manuallyAuthed) {
    return NextResponse.json({ error: 'Cron-only endpoint' }, { status: 403 });
  }

  const started = Date.now();
  const results: Array<{
    seal_id: string;
    agent: string;
    ok: boolean;
    transition?: string;
    error?: string;
  }> = [];
  const errors: string[] = [];

  let allSeals: Seal[] = [];
  try {
    allSeals = await listAllSeals(200);
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: `listAllSeals failed: ${e instanceof Error ? e.message : String(e)}`,
    }, { status: 500 });
  }

  const quarantined = allSeals.filter((s) => s.status === 'quarantined');
  // Track seals where all agents already attested in prior runs but the seal is still
  // quarantined — the inner loop's `continue` guard skips them all, leaving them stuck.
  const fullyAttestedButStuck: string[] = [];

  for (const seal of quarantined) {
    const agentsPending = SENTINEL_AGENTS.filter((a) => !seal.attestations[a]);
    if (agentsPending.length === 0) {
      fullyAttestedButStuck.push(seal.seal_id);
      continue;
    }

    // Exponential backoff: skip seals retried too recently to avoid hammering
    if (await shouldSkipRetry(seal.seal_id)) {
      results.push({ seal_id: seal.seal_id, agent: 'backoff', ok: true, transition: 'skipped-backoff' });
      continue;
    }

    for (const agent of agentsPending) {
      try {
        const r = await backAttestSeal({
          seal_id: seal.seal_id,
          agent,
          verdict: 'pass',
          rationale: buildBackAttestRationale(agent, seal.seal_id),
          posture: agent === 'AUREA' ? 'cautionary' : undefined,
        });

        results.push({
          seal_id: seal.seal_id,
          agent,
          ok: r.ok,
          transition: r.ok ? r.transition : undefined,
          error: !r.ok ? r.reason : undefined,
        });

        if (r.ok && r.transition === 'attested') {
          void releaseReplayPressureForAttestedSeal().catch(() => {});
          console.info('[reattest-seals] seal transitioned → attested', { seal_id: seal.seal_id, agent });
          break; // seal is now attested; remaining agents are moot
        }
      } catch (e) {
        const msg = `${seal.seal_id}/${agent}: ${e instanceof Error ? e.message : String(e)}`;
        errors.push(msg);
        results.push({ seal_id: seal.seal_id, agent, ok: false, error: msg });
      }
    }
    await recordReattestAttempt(seal.seal_id);
  }

  // FIX-506-03: fully-attested seals stuck in quarantine have all 5 agent signatures
  // but substrate_attestation_error is null — meaning a prior write appeared to succeed
  // (or was never attempted) yet the seal was never promoted. Force a direct substrate
  // write rather than re-running attestation (which the dedup guard would skip anyway).
  for (const seal_id of fullyAttestedButStuck) {
    if (await shouldSkipRetry(seal_id)) {
      results.push({ seal_id, agent: 'substrate-write', ok: true, transition: 'skipped-backoff' });
      continue;
    }
    const seal = allSeals.find((s) => s.seal_id === seal_id);
    if (!seal) { errors.push(`[stuck] ${seal_id}: seal not found in listAllSeals`); continue; }

    try {
      console.warn('[reattest-seals] fully-attested-but-stuck — forcing substrate write', { seal_id });
      const substrate = await attestReserveBlockToSubstrate(seal);
      const substrateError = substrate.ok ? null : (substrate.error ?? 'substrate_write_failed');

      const updatedSeal: Seal = {
        ...seal,
        substrate_attestation_id: substrate.ok ? (substrate.entryId ?? null) : seal.substrate_attestation_id,
        substrate_event_hash: substrate.ok ? (substrate.eventHash ?? substrate.entryId ?? null) : seal.substrate_event_hash,
        substrate_attested_at: substrate.ok ? (substrate.attestedAt ?? new Date().toISOString()) : seal.substrate_attested_at,
        substrate_attestation_error: substrateError,
      };
      await writeSeal(updatedSeal);

      results.push({
        seal_id,
        agent: 'substrate-write',
        ok: substrate.ok,
        transition: substrate.ok ? 'substrate-written' : undefined,
        error: substrateError ?? undefined,
      });

      if (substrate.ok) {
        void releaseReplayPressureForAttestedSeal().catch(() => {});
        console.info('[reattest-seals] stuck seal substrate write ok — seal updated', { seal_id });
      } else {
        console.error('[reattest-seals] stuck seal substrate write failed', { seal_id, error: substrateError });
      }
    } catch (e) {
      const msg = `[stuck-substrate] ${seal_id}: ${e instanceof Error ? e.message : String(e)}`;
      errors.push(msg);
      results.push({ seal_id, agent: 'substrate-write', ok: false, error: msg });
    }
    await recordReattestAttempt(seal_id);
  }

  const attested = results.filter((r) => r.transition === 'attested').length;
  const recorded = results.filter((r) => r.transition === 'recorded').length;

  // Surface substrate error details for seals that are fully attested but stuck in quarantine.
  // These seals have all agent signatures but the substrate write is failing — operators need
  // the actual error (not just "seal still quarantined") to diagnose the P0 substrate issue.
  const stuckSubstrateErrors: Record<string, string | null> = {};
  for (const seal_id of fullyAttestedButStuck) {
    const seal = allSeals.find((s) => s.seal_id === seal_id);
    if (seal) {
      stuckSubstrateErrors[seal_id] = seal.substrate_attestation_error ?? null;
    }
  }

  if (fullyAttestedButStuck.length > 0) {
    console.warn('[reattest-seals] fully-attested quarantined seals — substrate errors:', stuckSubstrateErrors);
  }

  return NextResponse.json({
    ok: errors.length === 0,
    at: new Date().toISOString(),
    duration_ms: Date.now() - started,
    quarantined_found: quarantined.length,
    stuck_fully_attested: fullyAttestedButStuck.length,
    stuck_substrate_errors: stuckSubstrateErrors,
    attestations_attempted: results.length,
    attested_transitions: attested,
    recorded_transitions: recorded,
    errors,
    results,
  });
}
