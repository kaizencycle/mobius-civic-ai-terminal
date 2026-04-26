import { writeToSubstrate } from '@/lib/substrate/client';
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
      tags: [
        'vault',
        'reserve-block',
        'substrate-attestation',
        `block-${seal.sequence}`,
        seal.status,
        `fountain-${seal.fountain_status}`,
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
