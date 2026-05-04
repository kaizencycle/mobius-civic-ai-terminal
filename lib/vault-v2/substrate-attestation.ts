import { writeToSubstrate } from '@/lib/substrate/client';
import { kvGet, kvSet, KV_KEYS } from '@/lib/kv/store';
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
 * C-299 Phase 6: the ledger 400 was caused by the Reserve Block path sending
 * Terminal-only enum values (`category: verification`, `source: zeus-verify`)
 * into the Render ledger schema. The canonical payload is now carried in tags,
 * derivedFrom, summary, and attestation_signature while the outer envelope uses
 * the known ledger-compatible agent-journal/infrastructure lane.
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
      category: 'infrastructure',
      severity: seal.status === 'attested' ? 'nominal' : seal.status === 'quarantined' ? 'elevated' : 'critical',
      source: 'agent-journal',
      gi_at_time: seal.gi_at_seal,
      confidence: passed.length / 5,
      verified: seal.status === 'attested',
      derivedFrom: [
        `vault/seal/${seal.seal_id}`,
        `seal_hash:${seal.seal_hash}`,
        ...(seal.prev_seal_hash ? [`prev_seal_hash:${seal.prev_seal_hash}`] : []),
      ],
      tags: [
        'vault',
        'reserve-block',
        'substrate-attestation',
        'seal-immortalization',
        `block-${seal.sequence}`,
        seal.status,
        `fountain-${seal.fountain_status}`,
        `cycle-${seal.cycle_at_seal}`,
        seal.prev_seal_hash ? `prev-${seal.prev_seal_hash.slice(0, 8)}` : 'genesis',
      ],
      attestation_signature: {
        type: 'seal_attestation',
        seal_id: seal.seal_id,
        seal_hash: seal.seal_hash,
        cycle_id: seal.cycle_at_seal,
        sealed_at: seal.sealed_at,
        sequence: seal.sequence,
        quorum_agents: passed,
        gi_at_seal: seal.gi_at_seal ?? 0,
        attested_at: attestedAt,
        node: 'vercel-cron',
      },
    });

    if (result.ok) {
      // Clear any persisted error from previous failed attempts.
      void kvSet('vault:substrate:last_error', null).catch(() => {});
    } else {
      const errDetail = result.error ?? 'substrate_write_failed';
      console.error('[vault-attestation] substrate write failed:', errDetail);
      void kvSet('vault:substrate:last_error', { error: errDetail, at: attestedAt }).catch(() => {});
      void enqueueSubstrateRetry(seal, errDetail).catch(() => {});
    }
    return {
      ok: result.ok,
      entryId: result.entryId,
      eventHash: result.entryId ?? null,
      attestedAt,
      error: result.error,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'reserve_block_substrate_attestation_failed';
    console.error('[vault-attestation] substrate write exception:', errMsg);
    void kvSet('vault:substrate:last_error', { error: errMsg, at: attestedAt }).catch(() => {});
    // Enqueue for reattest-seals cron retry on any write failure.
    void enqueueSubstrateRetry(seal, errMsg).catch(() => {});
    return { ok: false, attestedAt, error: errMsg };
  }
}

export type SubstrateRetryEntry = {
  seal_id: string;
  sequence: number;
  cycle: string;
  failed_at: string;
  error: string;
};

const SUBSTRATE_RETRY_TTL_SECONDS = 604800;

export async function enqueueSubstrateRetry(
  seal: Pick<Seal, 'seal_id' | 'sequence' | 'cycle_at_seal'>,
  error: string,
): Promise<void> {
  try {
    const queue = (await kvGet<SubstrateRetryEntry[]>(KV_KEYS.SUBSTRATE_RETRY_QUEUE)) ?? [];
    if (queue.some((e) => e.seal_id === seal.seal_id)) return;
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

export async function loadSubstrateRetryQueue(): Promise<SubstrateRetryEntry[]> {
  try {
    return (await kvGet<SubstrateRetryEntry[]>(KV_KEYS.SUBSTRATE_RETRY_QUEUE)) ?? [];
  } catch {
    return [];
  }
}
