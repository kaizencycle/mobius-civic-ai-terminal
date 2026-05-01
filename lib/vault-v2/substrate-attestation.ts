import { writeToSubstrate } from '@/lib/substrate/client';
import { kvGet, kvSet, KV_KEYS, KV_TTL_SECONDS } from '@/lib/kv/store';
import type { Seal } from '@/lib/vault-v2/types';

export type ReserveBlockSubstrateResult = {
  ok: boolean;
  entryId?: string;
  eventHash?: string | null;
  attestedAt?: string;
  error?: string;
};

function quorumPassedAgents(seal: Seal): string[] {
  return Object.entries(seal.attestations)
    .filter(([, attestation]) => attestation?.verdict === 'pass')
    .map(([agent]) => agent);
}

function summarizeSeal(seal: Seal): string {
  const passed = quorumPassedAgents(seal);
  return [
    `Reserve Block ${seal.sequence} ${seal.status}.`,
    `${seal.reserve} MIC reserve units sealed under ${seal.seal_id}.`,
    `Quorum passes: ${passed.length}/5.`,
    `Fountain status: ${seal.fountain_status}.`,
  ].join(' ');
}

/**
 * Immortalize a finalized Reserve Block in the Civic Protocol / Substrate lane.
 *
 * The Vault remains the formation lane and KV remains the fast operational lane.
 * This write is the canonical civic proof pointer operators can audit later.
 */
export async function attestReserveBlockToSubstrate(seal: Seal): Promise<ReserveBlockSubstrateResult> {
  const attestedAt = new Date().toISOString();
  const passed = quorumPassedAgents(seal);

  try {
    const result = await writeToSubstrate({
      id: `reserve-block-${seal.seal_id}`,
      timestamp: attestedAt,
      agent: 'ZEUS',
      agentOrigin: 'ZEUS',
      cycle: seal.cycle_at_seal,
      title: `Reserve Block ${seal.sequence} ${seal.status}`,
      summary: summarizeSeal(seal),
      category: 'verification',
      severity: seal.status === 'attested' ? 'nominal' : seal.status === 'quarantined' ? 'elevated' : 'critical',
      source: 'zeus-verify',
      gi_at_time: seal.gi_at_seal,
      confidence: passed.length / 5,
      verified: seal.status === 'attested',
      derivedFrom: [
        `vault/seal/${seal.seal_id}`,
        `seal_hash:${seal.seal_hash}`,
        ...(seal.prev_seal_hash ? [`prev_seal_hash:${seal.prev_seal_hash}`] : []),
      ],
      // OPT-7 (C-293): include cycle tag so substrate queries can filter by cycle
      tags: [
        'vault',
        'reserve-block',
        'substrate-attestation',
        `block-${seal.sequence}`,
        seal.status,
        `fountain-${seal.fountain_status}`,
        `cycle-${seal.cycle_at_seal}`,
        seal.prev_seal_hash ? `prev-${seal.prev_seal_hash.slice(0, 8)}` : 'genesis',
      ],
    });

    return {
      ok: result.ok,
      entryId: result.entryId,
      eventHash: result.entryId ?? null,
      attestedAt,
      error: result.error,
    };
  } catch (error) {
    return {
      ok: false,
      attestedAt,
      error: error instanceof Error ? error.message : 'reserve_block_substrate_attestation_failed',
    };
  }
}

export type SubstrateRetryEntry = {
  seal_id: string;
  sequence: number;
  cycle: string;
  failed_at: string;
  error: string;
};

// 7-day TTL — long enough to survive multiple cron attempts
const SUBSTRATE_RETRY_TTL_SECONDS = 604800;

/** Enqueue a seal_id for substrate retry after a failed attestation write. */
export async function enqueueSubstrateRetry(
  seal: Pick<Seal, 'seal_id' | 'sequence' | 'cycle_at_seal'>,
  error: string,
): Promise<void> {
  try {
    const queue = (await kvGet<SubstrateRetryEntry[]>(KV_KEYS.SUBSTRATE_RETRY_QUEUE)) ?? [];
    if (queue.some((e) => e.seal_id === seal.seal_id)) return; // already queued
    queue.unshift({
      seal_id: seal.seal_id,
      sequence: seal.sequence,
      cycle: seal.cycle_at_seal,
      failed_at: new Date().toISOString(),
      error,
    });
    await kvSet(KV_KEYS.SUBSTRATE_RETRY_QUEUE, queue.slice(0, 50), SUBSTRATE_RETRY_TTL_SECONDS);
  } catch {
    // non-fatal — seal already persisted as attested, substrate retry is best-effort
  }
}

/** Dequeue a seal after successful substrate retry. */
export async function dequeueSubstrateRetry(seal_id: string): Promise<void> {
  try {
    const queue = (await kvGet<SubstrateRetryEntry[]>(KV_KEYS.SUBSTRATE_RETRY_QUEUE)) ?? [];
    const updated = queue.filter((e) => e.seal_id !== seal_id);
    if (updated.length === queue.length) return;
    await kvSet(KV_KEYS.SUBSTRATE_RETRY_QUEUE, updated, SUBSTRATE_RETRY_TTL_SECONDS);
  } catch {
    // non-fatal
  }
}

/** Load the current substrate retry queue. Returns [] on failure. */
export async function loadSubstrateRetryQueue(): Promise<SubstrateRetryEntry[]> {
  try {
    return (await kvGet<SubstrateRetryEntry[]>(KV_KEYS.SUBSTRATE_RETRY_QUEUE)) ?? [];
  } catch {
    return [];
  }
}
