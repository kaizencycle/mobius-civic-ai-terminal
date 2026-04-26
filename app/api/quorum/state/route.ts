import { NextResponse } from 'next/server';
import { computeIntegrityPayload } from '@/lib/integrity/buildStatus';
import { resolveGiChain } from '@/lib/gi/resolveGiChain';
import { loadMicReadinessSnapshotRaw } from '@/lib/mic/loadReadinessSnapshot';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import {
  countAllSeals,
  countSeals,
  getCandidate,
  getInProgressBalance,
  getLatestSeal,
  readInProgressHashes,
} from '@/lib/vault-v2/store';
import { SENTINEL_AGENTS } from '@/lib/vault-v2/types';
import { SENTINEL_ATTESTATION_COUNT, VAULT_RESERVE_PARCEL_UNITS } from '@/lib/vault-v2/constants';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function safeFinite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function modeFromGi(gi: number | null): 'green' | 'yellow' | 'red' {
  if (gi === null) return 'red';
  if (gi >= 0.95) return 'green';
  if (gi >= 0.6) return 'yellow';
  return 'red';
}

function attestationStatus(candidate: Awaited<ReturnType<typeof getCandidate>>) {
  const rows = Object.fromEntries(
    SENTINEL_AGENTS.map((agent) => {
      const attestation = candidate?.attestations?.[agent] ?? null;
      return [agent, attestation ? {
        status: attestation.verdict,
        timestamp: attestation.timestamp,
        signature_present: Boolean(attestation.signature),
        rationale: attestation.rationale,
      } : { status: 'pending' }];
    }),
  );
  const received = candidate ? Object.keys(candidate.attestations).length : 0;
  return {
    required: [...SENTINEL_AGENTS],
    received,
    needed: Math.max(0, SENTINEL_ATTESTATION_COUNT - received),
    by_agent: rows,
  };
}

export async function GET() {
  const [integrityPayload, micRaw, candidate, inProgressBalance, inProgressHashes, sealsCount, sealsAuditCount, latestSeal] = await Promise.all([
    computeIntegrityPayload(),
    loadMicReadinessSnapshotRaw(),
    getCandidate(),
    getInProgressBalance(),
    readInProgressHashes(),
    countSeals(),
    countAllSeals(),
    getLatestSeal(),
  ]);
  const chain = await resolveGiChain({ micReadinessSnapshotRaw: micRaw.raw });
  const gi = safeFinite(chain.gi) ?? safeFinite(integrityPayload.global_integrity);
  const cycle = chain.cycle ?? integrityPayload.cycle ?? currentCycleId();
  const blockSize = VAULT_RESERVE_PARCEL_UNITS;
  const inProgressBlock = candidate?.sequence ?? Math.max(sealsAuditCount, sealsCount) + 1;
  const reserveProgressPct = blockSize > 0 ? Math.min(100, Math.round((inProgressBalance / blockSize) * 100)) : 0;
  const latestImmortalized = Boolean(latestSeal?.substrate_attestation_id && latestSeal?.substrate_event_hash);

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    cycle,
    phase: 'C-293-phase1-quorum-state-reader',
    integrity: {
      gi,
      mode: chain.mode ?? integrityPayload.mode ?? modeFromGi(gi),
      terminal_status: chain.terminal_status ?? integrityPayload.terminal_status ?? 'unknown',
      source: chain.source ?? integrityPayload.source,
      verified: chain.verified ?? false,
      degraded: chain.degraded ?? integrityPayload.degraded ?? false,
      age_seconds: chain.age_seconds ?? null,
    },
    reserve_block: {
      block_size: blockSize,
      in_progress_block: inProgressBlock,
      in_progress_balance: Number(inProgressBalance.toFixed(6)),
      in_progress_pct: reserveProgressPct,
      remaining_to_next_block: Number(Math.max(0, blockSize - inProgressBalance).toFixed(6)),
      sealed_blocks: sealsCount,
      finalized_blocks: sealsAuditCount,
      latest_seal_id: latestSeal?.seal_id ?? null,
      latest_seal_hash: latestSeal?.seal_hash ?? null,
      latest_prev_seal_hash: latestSeal?.prev_seal_hash ?? null,
      latest_status: latestSeal?.status ?? null,
      latest_fountain_status: latestSeal?.fountain_status ?? null,
      latest_substrate_attestation_id: latestSeal?.substrate_attestation_id ?? null,
      latest_substrate_event_hash: latestSeal?.substrate_event_hash ?? null,
      latest_immortalized: latestImmortalized,
    },
    candidate: candidate ? {
      in_flight: true,
      seal_id: candidate.seal_id,
      sequence: candidate.sequence,
      cycle_at_seal: candidate.cycle_at_seal,
      reserve: candidate.reserve,
      seal_hash: candidate.seal_hash,
      prev_seal_hash: candidate.prev_seal_hash,
      gi_at_seal: candidate.gi_at_seal,
      mode_at_seal: candidate.mode_at_seal,
      source_entries: candidate.source_entries,
      deposit_hash_count: candidate.deposit_hashes.length,
      deposit_hashes: candidate.deposit_hashes,
      carried_forward_deposit_hash_count: candidate.carried_forward_deposit_hashes?.length ?? 0,
      requested_at: candidate.requested_at,
      timeout_at: candidate.timeout_at,
    } : {
      in_flight: false,
      seal_id: null,
      deposit_hash_count: inProgressHashes.length,
      deposit_hashes_preview: inProgressHashes.slice(0, 25),
    },
    attestations: attestationStatus(candidate),
    decision: {
      ready_for_quorum: Boolean(candidate),
      ready_for_substrate: Boolean(candidate && Object.keys(candidate.attestations).length >= SENTINEL_ATTESTATION_COUNT),
      canon: 'Agents should read this shared quorum state before signing a Reserve Block. Quorum signs one seal_id, one seal_hash, one candidate truth.',
    },
  }, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Mobius-Source': 'quorum-state-reader',
    },
  });
}
