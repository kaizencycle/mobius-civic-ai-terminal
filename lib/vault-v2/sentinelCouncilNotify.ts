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

  // FIX-1 (C-293): set agentOrigin = agent (not 'TERMINAL') so loadEntries tier
  // filters work correctly (ATLAS/ZEUS entries appear in t2 view).
  // FIX-4 (C-293): status='committed' so scheduleVaultDepositForJournal fires,
  // but we rely on appendAgentJournalEntry's own deposit guard rather than
  // recursive formation risk from 'draft' entries being re-processed.
  // OPT-1 (C-293): sequential writes instead of Promise.all to avoid 5-agent
  // thundering-herd on KV (5 concurrent sets + 5 watermark bumps + 5 substrate
  // writes) every time a seal candidate forms. Sentinel council notifications
  // are low-urgency; a few extra ms is fine.
  for (const agent of SENTINEL_AGENTS) {
    try {
      await appendAgentJournalEntry({
        agent,
        cycle,
        observation: obs,
        inference: `Sentinel Council: attestation window open for ${candidate.seal_id}. Post verdict via /api/vault/seal/attest.`,
        recommendation:
          'Review seal_hash and deposit_hashes; attest pass/flag/reject with rationale before timeout_at.',
        confidence: 0.95,
        status: 'committed',
        category: 'alert',
        severity: 'elevated',
        derivedFrom: [candidate.seal_id, candidate.seal_hash],
        relatedAgents: [...SENTINEL_AGENTS],
        agentOrigin: agent, // FIX-1: was 'TERMINAL', now agent name
      });
    } catch (err) {
      console.warn(
        `[vault-v2] sentinel council journal notify failed for ${agent}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
