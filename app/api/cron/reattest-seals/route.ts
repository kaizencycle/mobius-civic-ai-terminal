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
 * C-310: also repairs attested seals whose Substrate pointer is stale/missing.
 * This closes the live failure mode where quorum completed but an older ledger
 * 400 ("No API base configured for terminal") remained attached forever after
 * env was fixed.
 *
 * Schedule: 0 * * * * (hourly)
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { bearerMatchesToken } from '@/lib/vault-v2/auth';
import { listAllSeals, writeSeal, appendSealToChain, getLatestSealId } from '@/lib/vault-v2/store';
import { backAttestSeal, buildBackAttestRationale } from '@/lib/vault-v2/back-attest';
import { attestReserveBlockToSubstrate, dequeueSubstrateRetry } from '@/lib/vault-v2/substrate-attestation';
import { SENTINEL_AGENTS } from '@/lib/vault-v2/types';
import { releaseReplayPressureForAttestedSeal } from '@/lib/mic/replayPressure';
import { kvGet, kvSet, kvDel, isRedisAvailable } from '@/lib/kv/store';
import type { Seal } from '@/lib/vault-v2/types';

export const dynamic = 'force-dynamic';

// C-314 T-07: one-time KV reset for seals that looped before TERMINAL_REGISTRATION was fixed.
// Expanded list: legacy v1 parcel IDs (C-288 … C-307-041) that share the same reattest backoff keys.
const LEGACY_SEAL_KV_RESET_IDS = [
  'seal-C-288-001',
  'seal-C-292-001',
  'seal-C-293-001',
  'seal-C-294-001',
  'seal-C-295-001',
  'seal-C-296-001',
  'seal-C-297-001',
  'seal-C-298-001',
  'seal-C-299-001',
  'seal-C-300-002',
  'seal-C-300-003',
  'seal-C-300-004',
  'seal-C-301-005',
  'seal-C-301-006',
  'seal-C-301-007',
  'seal-C-302-008',
  'seal-C-302-009',
  'seal-C-302-010',
  'seal-C-302-011',
  'seal-C-303-012',
  'seal-C-303-013',
  'seal-C-303-014',
  'seal-C-303-015',
  'seal-C-303-016',
  'seal-C-304-017',
  'seal-C-304-018',
  'seal-C-304-019',
  'seal-C-304-020',
  'seal-C-304-021',
  'seal-C-304-022',
  'seal-C-304-023',
  'seal-C-305-024',
  'seal-C-305-025',
  'seal-C-305-026',
  'seal-C-305-027',
  'seal-C-305-028',
  'seal-C-306-029',
  'seal-C-306-030',
  'seal-C-306-031',
  'seal-C-306-032',
  'seal-C-306-033',
  'seal-C-306-034',
  'seal-C-306-035',
  'seal-C-307-036',
  'seal-C-307-037',
  'seal-C-307-038',
  'seal-C-307-039',
  'seal-C-307-040',
  'seal-C-307-041',
] as const;

const C314_REATTEST_MIGRATION_KEY = 'reattest:c314-migration-done';
/** One-time burst repair after TERMINAL_ID / TERMINAL_API_BASE + ledger client fix (C-314). */
const SUBSTRATE_FIX_C314_KEY = 'reattest:substrate-fix-c314-done';

async function runLegacySealMigration(allSeals: Seal[]): Promise<void> {
  if (!isRedisAvailable()) {
    console.warn('[reattest-seals] C-314 legacy migration skipped — KV not configured');
    return;
  }

  const done = await kvGet<boolean>(C314_REATTEST_MIGRATION_KEY);
  if (done) return;

  if (!isRedisAvailable()) {
    console.warn('[reattest-seals] C-314 migration deferred: KV not available');
    return;
  }

  console.info('[reattest-seals] C-314 migration: clearing stuck quarantine / reattest KV for legacy seal IDs');
  let migrationOk = true;

  for (const sealId of LEGACY_SEAL_KV_RESET_IDS) {
    const delAttempts = await kvDel(`seal:${sealId}:reattest_attempts`);
    const delLast = await kvDel(`seal:${sealId}:reattest_last_attempt`);
    if (!delAttempts && !delLast) {
      // Keys may be absent; kvDel returns false when Redis unavailable (already guarded).
    }

    const seal = allSeals.find((s) => s.seal_id === sealId);
    if (seal && seal.status === 'permanently-failed') {
      try {
        await writeSeal({
          ...seal,
          status: 'quarantined',
          substrate_attestation_error: null,
        });
      } catch (e) {
        migrationOk = false;
        console.warn(`[reattest-seals] migration: could not reset seal ${sealId}`, e);
      }
    }

    console.info(`[reattest-seals] migration reset keys for ${sealId}`);
  }

  if (!migrationOk) {
    console.error('[reattest-seals] C-314 legacy migration incomplete — not marking migration key');
    return;
  }

  const setOk = await kvSet(C314_REATTEST_MIGRATION_KEY, true, 365 * 24 * 3600);
  if (!setOk) {
    console.error('[reattest-seals] C-314 legacy migration: failed to persist migration key');
  }
}

// Max reattest attempts before a seal is marked permanently-failed (prevents infinite loops).
// At 1h cron cadence, 12 attempts ≈ 12 hours of retries before giving up.
const MAX_REATTEST_ATTEMPTS = 12;

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

function hasCompleteSentinelQuorum(seal: Seal): boolean {
  return SENTINEL_AGENTS.every((agent) => Boolean(seal.attestations[agent]));
}

function needsSubstratePointerRepair(seal: Seal): boolean {
  return (
    seal.status === 'attested'
    && hasCompleteSentinelQuorum(seal)
    && (
      !seal.substrate_attestation_id
      || !seal.substrate_event_hash
      || Boolean(seal.substrate_attestation_error)
    )
  );
}

type SubstrateRetryOpts = {
  /** When true, ignore exponential backoff (C-314 burst migration). */
  skipBackoff?: boolean;
  /** When true, only record attempts on failure (burst should not penalize successes). */
  burstMode?: boolean;
};

async function retrySubstratePointer(
  seal: Seal,
  results: Array<{ seal_id: string; agent: string; ok: boolean; transition?: string; error?: string }>,
  errors: string[],
  reason: 'stuck-quarantined' | 'stale-substrate-pointer',
  opts?: SubstrateRetryOpts,
): Promise<void> {
  if (!opts?.skipBackoff && (await shouldSkipRetry(seal.seal_id))) {
    results.push({ seal_id: seal.seal_id, agent: 'substrate-write', ok: true, transition: 'skipped-backoff' });
    return;
  }

  let recordAttempt = !opts?.burstMode;

  try {
    console.warn('[reattest-seals] forcing substrate write', { seal_id: seal.seal_id, reason });
    const substrate = await attestReserveBlockToSubstrate(seal);
    const substrateError = substrate.ok ? null : (substrate.error ?? 'substrate_write_failed');
    if (opts?.burstMode) {
      recordAttempt = !substrate.ok;
    }

    const updatedSeal: Seal = {
      ...seal,
      status: substrate.ok ? 'attested' : seal.status,
      substrate_attestation_id: substrate.ok ? (substrate.entryId ?? null) : seal.substrate_attestation_id,
      substrate_event_hash: substrate.ok ? (substrate.eventHash ?? substrate.entryId ?? null) : seal.substrate_event_hash,
      substrate_attested_at: substrate.ok ? (substrate.attestedAt ?? new Date().toISOString()) : seal.substrate_attested_at,
      substrate_attestation_error: substrateError,
    };

    await writeSeal(updatedSeal);

    if (substrate.ok) {
      const latestSealId = await getLatestSealId().catch(() => null);
      const repairedCurrentHead = latestSealId === updatedSeal.seal_id;

      if (reason === 'stuck-quarantined' || repairedCurrentHead) {
        await appendSealToChain(updatedSeal).catch((err: unknown) => {
          console.warn('[reattest-seals] appendSealToChain failed (non-fatal):', (err as Error)?.message);
        });
      } else {
        console.info('[reattest-seals] historical substrate pointer repaired without moving chain head', {
          seal_id: updatedSeal.seal_id,
          latest_seal_id: latestSealId,
        });
      }

      await dequeueSubstrateRetry(updatedSeal.seal_id).catch(() => {});
      void releaseReplayPressureForAttestedSeal().catch(() => {});
      console.info('[reattest-seals] substrate pointer repaired', { seal_id: seal.seal_id, reason });
    } else {
      console.error('[reattest-seals] substrate pointer repair failed', { seal_id: seal.seal_id, reason, error: substrateError });
    }

    results.push({
      seal_id: seal.seal_id,
      agent: 'substrate-write',
      ok: substrate.ok,
      transition: substrate.ok ? 'substrate-pointer-repaired' : undefined,
      error: substrateError ?? undefined,
    });
  } catch (e) {
    recordAttempt = true;
    const msg = `[substrate-retry:${reason}] ${seal.seal_id}: ${e instanceof Error ? e.message : String(e)}`;
    errors.push(msg);
    results.push({ seal_id: seal.seal_id, agent: 'substrate-write', ok: false, error: msg });
  }

  if (recordAttempt) {
    await recordReattestAttempt(seal.seal_id);
  }
}

async function runSubstrateFixBurstC314(
  seals: Seal[],
  results: Array<{ seal_id: string; agent: string; ok: boolean; transition?: string; error?: string }>,
  errors: string[],
): Promise<{ ranBurst: boolean; targets: number; remainingAfter: number }> {
  const already = await kvGet<boolean>(SUBSTRATE_FIX_C314_KEY);
  if (already) {
    return { ranBurst: false, targets: 0, remainingAfter: 0 };
  }
  if (!isRedisAvailable()) {
    console.warn('[reattest-seals] C-314 substrate burst skipped — KV not configured');
    return { ranBurst: false, targets: 0, remainingAfter: 0 };
  }

  const targets = seals.filter(needsSubstratePointerRepair);
  if (targets.length === 0) {
    const setOk = await kvSet(SUBSTRATE_FIX_C314_KEY, true, 365 * 24 * 3600);
    if (!setOk) {
      console.error('[reattest-seals] C-314 substrate burst: could not set completion key (nothing to repair)');
    }
    return { ranBurst: true, targets: 0, remainingAfter: 0 };
  }

  console.info(`[reattest-seals] C-314 substrate burst migration: ${targets.length} seals (no backoff)`);

  for (const seal of targets) {
    await kvDel(`seal:${seal.seal_id}:reattest_attempts`);
    await kvDel(`seal:${seal.seal_id}:reattest_last_attempt`);
    await retrySubstratePointer(seal, results, errors, 'stale-substrate-pointer', {
      skipBackoff: true,
      burstMode: true,
    });
  }

  let remainingAfter = targets.length;
  try {
    const refreshed = await listAllSeals(500);
    remainingAfter = refreshed.filter(needsSubstratePointerRepair).length;
  } catch {
    remainingAfter = targets.length;
  }

  if (remainingAfter === 0) {
    const setOk = await kvSet(SUBSTRATE_FIX_C314_KEY, true, 365 * 24 * 3600);
    if (!setOk) {
      console.error('[reattest-seals] C-314 substrate burst: completion KV SET failed — will retry next cron');
    } else {
      console.info('[reattest-seals] C-314 substrate burst migration complete — all targets repaired');
    }
  } else {
    console.warn('[reattest-seals] C-314 substrate burst incomplete — completion key not set', {
      remainingAfter,
    });
  }

  return { ranBurst: true, targets: targets.length, remainingAfter };
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
    allSeals = await listAllSeals(500);
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: `listAllSeals failed: ${e instanceof Error ? e.message : String(e)}`,
    }, { status: 500 });
  }

  await runLegacySealMigration(allSeals);
  try {
    allSeals = await listAllSeals(500);
  } catch {
    // keep prior list if refresh fails
  }

  const substrateBurst = await runSubstrateFixBurstC314(allSeals, results, errors);
  if (substrateBurst.ranBurst) {
    try {
      allSeals = await listAllSeals(500);
    } catch {
      // keep prior list if refresh fails
    }
  }

  const quarantined = allSeals.filter((s) => s.status === 'quarantined');
  const staleSubstratePointers = allSeals.filter(needsSubstratePointerRepair);
  // Track seals where all agents already attested in prior runs but the seal is still
  // quarantined — the inner loop's `continue` guard skips them all, leaving them stuck.
  const fullyAttestedButStuck: string[] = [];

  for (const seal of quarantined) {
    const agentsPending = SENTINEL_AGENTS.filter((a) => !seal.attestations[a]);
    if (agentsPending.length === 0) {
      fullyAttestedButStuck.push(seal.seal_id);
      continue;
    }

    // FIX-07: cap total attempts to prevent seals from looping forever.
    const attempts = (await kvGet<number>(`seal:${seal.seal_id}:reattest_attempts`)) ?? 0;
    if (attempts >= MAX_REATTEST_ATTEMPTS) {
      console.error(
        `[reattest-seals] ${seal.seal_id} exceeded ${MAX_REATTEST_ATTEMPTS} attempts — marking permanently-failed`,
      );
      await writeSeal({ ...seal, status: 'permanently-failed' }).catch(() => {});
      results.push({ seal_id: seal.seal_id, agent: 'cap', ok: false, transition: 'permanently-failed', error: `exceeded_${MAX_REATTEST_ATTEMPTS}_attempts` });
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
    const seal = allSeals.find((s) => s.seal_id === seal_id);
    if (!seal) {
      errors.push(`[stuck] ${seal_id}: seal not found in listAllSeals`);
      continue;
    }
    await retrySubstratePointer(seal, results, errors, 'stuck-quarantined');
  }

  // C-310: attested seals can also carry stale/missing Substrate pointers after a
  // transient Render ledger 400. They are not quarantined, so the historical retry
  // path never saw them. Repair them here without rewriting the seal history.
  for (const seal of staleSubstratePointers) {
    await retrySubstratePointer(seal, results, errors, 'stale-substrate-pointer');
  }

  const attested = results.filter((r) => r.transition === 'attested').length;
  const recorded = results.filter((r) => r.transition === 'recorded').length;
  const substrateRepaired = results.filter((r) => r.transition === 'substrate-pointer-repaired').length;

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

  const staleSubstratePointerErrors: Record<string, string | null> = {};
  for (const seal of staleSubstratePointers) {
    staleSubstratePointerErrors[seal.seal_id] = seal.substrate_attestation_error ?? null;
  }

  if (fullyAttestedButStuck.length > 0) {
    console.warn('[reattest-seals] fully-attested quarantined seals — substrate errors:', stuckSubstrateErrors);
  }
  if (staleSubstratePointers.length > 0) {
    console.warn('[reattest-seals] stale attested substrate pointers:', staleSubstratePointerErrors);
  }

  return NextResponse.json({
    ok: errors.length === 0,
    at: new Date().toISOString(),
    duration_ms: Date.now() - started,
    c314_substrate_burst: substrateBurst,
    quarantined_found: quarantined.length,
    stuck_fully_attested: fullyAttestedButStuck.length,
    stale_substrate_pointers: staleSubstratePointers.length,
    stuck_substrate_errors: stuckSubstrateErrors,
    stale_substrate_pointer_errors: staleSubstratePointerErrors,
    attestations_attempted: results.length,
    attested_transitions: attested,
    recorded_transitions: recorded,
    substrate_pointer_repairs: substrateRepaired,
    errors,
    results,
  });
}
