/**
 * C-288 — When a Seal candidate forms at the first tranche threshold, surface a
 * Sentinel Council notification in agent journals (draft; no vault deposit).
 */

import { appendAgentJournalEntry } from '@/lib/agents/journal';
import type { SealCandidate } from '@/lib/vault-v2/types';
import { SENTINEL_AGENTS } from '@/lib/vault-v2/types';

export async function notifySentinelCouncilSealFormation(candidate: SealCandidate): Promise<void> {
  const cycle = candidate.cycle_at_seal?.trim() || 'unknown';
  const obs =
    `Seal candidate ${candidate.seal_id} formed (sequence ${candidate.sequence}). ` +
    `Reserve parcel threshold reached; GI at seal ${candidate.gi_at_seal.toFixed(3)}, mode ${candidate.mode_at_seal}. ` +
    `Source entries: ${candidate.source_entries}. Awaiting Sentinel attestations before quorum.`;

  await Promise.all(
    SENTINEL_AGENTS.map((agent) =>
      appendAgentJournalEntry({
        agent,
        cycle,
        observation: obs,
        inference: `Sentinel Council: attestation window open for ${candidate.seal_id}. Post verdict via /api/vault/seal/attest.`,
        recommendation:
          'Review seal_hash and deposit_hashes; attest pass/flag/reject with rationale before timeout_at.',
        confidence: 0.95,
        status: 'draft',
        category: 'alert',
        severity: 'elevated',
        derivedFrom: [candidate.seal_id, candidate.seal_hash],
        relatedAgents: [...SENTINEL_AGENTS],
        agentOrigin: 'TERMINAL',
      }).catch((err) => {
        console.warn(`[vault-v2] sentinel council journal notify failed for ${agent}:`, err instanceof Error ? err.message : err);
      }),
    ),
  );
}
