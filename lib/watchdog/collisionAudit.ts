/**
 * C-373 deterministic collision audit — read-only lineage evidence export.
 * EPICON: EPICON_C-373_ATLAS_vault-kv-canonical-lineage-recovery_v1
 */

import { createHash } from 'node:crypto';
import { pickPreferredSeal, quorumCount } from '@/lib/dat/reserveBlockCollisions';
import type { Seal, SentinelAgent } from '@/lib/vault-v2/types';
import { SENTINEL_AGENTS } from '@/lib/vault-v2/types';

export const COLLISION_AUDIT_SCHEMA_VERSION = '1.0' as const;

export type CollisionAuditSeal = {
  seal_id: string;
  cycle: string;
  status: 'attested';
  seal_hash: string;
  sealed_at: string;
  substrate_attested_at: string;
  quorum_count: number;
  attestation_agents: SentinelAgent[];
  payload_fingerprint: string;
};

export type BlockCollisionResolutionState = {
  algorithmically_preferred: string;
  canonically_proven: string | null;
  human_approved: string | null;
};

export type BlockCollisionAudit = {
  block_number: number;
  candidate_seals: CollisionAuditSeal[];
  hash_divergent: boolean;
  preferred_by_current_algorithm: string;
  preference_rationale: string[];
  requires_human_review: boolean;
  resolution_state: BlockCollisionResolutionState;
};

export type CollisionAuditReport = {
  schema_version: typeof COLLISION_AUDIT_SCHEMA_VERSION;
  cycle: string;
  audited_at: string;
  raw_attested_count: number;
  unique_block_count: number;
  collision_group_count: number;
  hash_divergent_group_count: number;
  critical: boolean;
  collisions: BlockCollisionAudit[];
  /** seal_id → seal_hash witness for repair staleness checks */
  kv_snapshot: Record<string, string>;
};

export function payloadFingerprint(seal: Seal): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        deposit_hashes: [...seal.deposit_hashes].sort(),
        source_entries: seal.source_entries,
        sequence: seal.sequence,
        prev_seal_hash: seal.prev_seal_hash,
      }),
    )
    .digest('hex');
}

function attestationAgents(seal: Seal): SentinelAgent[] {
  return SENTINEL_AGENTS.filter((agent) => Boolean(seal.attestations?.[agent]?.signature));
}

export function toCollisionAuditSeal(seal: Seal): CollisionAuditSeal {
  return {
    seal_id: seal.seal_id,
    cycle: seal.cycle_at_seal,
    status: 'attested',
    seal_hash: seal.seal_hash,
    sealed_at: seal.sealed_at,
    substrate_attested_at: seal.substrate_attested_at ?? '',
    quorum_count: quorumCount(seal),
    attestation_agents: attestationAgents(seal),
    payload_fingerprint: payloadFingerprint(seal),
  };
}

export function buildPreferenceRationale(winner: Seal, group: Seal[]): string[] {
  const reasons: string[] = [];
  for (const challenger of group) {
    if (challenger.seal_id === winner.seal_id) continue;
    const wq = quorumCount(winner);
    const cq = quorumCount(challenger);
    if (wq !== cq) {
      reasons.push(`quorum: ${winner.seal_id}(${wq}) > ${challenger.seal_id}(${cq})`);
      continue;
    }
    if (winner.sealed_at !== challenger.sealed_at) {
      reasons.push(
        `sealed_at: ${winner.seal_id}(${winner.sealed_at}) > ${challenger.seal_id}(${challenger.sealed_at})`,
      );
      continue;
    }
    reasons.push(`seal_id tie-break: ${winner.seal_id} > ${challenger.seal_id}`);
  }
  return reasons;
}

function groupHasHashDivergence(group: Seal[]): boolean {
  const hashes = new Set(group.map((s) => s.seal_hash));
  return hashes.size > 1;
}

/**
 * Build a deterministic collision audit from attested seals.
 * No KV mutation. Hash-divergent groups always require human review.
 */
export function buildCollisionAuditReport(
  seals: Seal[],
  options: { cycle: string; audited_at?: string },
): CollisionAuditReport {
  const audited_at = options.audited_at ?? new Date().toISOString();
  const attested = seals.filter((s) => s.status === 'attested');
  const byNumber = new Map<number, Seal[]>();

  for (const seal of attested) {
    const group = byNumber.get(seal.sequence) ?? [];
    group.push(seal);
    byNumber.set(seal.sequence, group);
  }

  const collisions: BlockCollisionAudit[] = [];
  const kv_snapshot: Record<string, string> = {};

  for (const [block_number, group] of [...byNumber.entries()].sort((a, b) => a[0] - b[0])) {
    for (const seal of group) {
      kv_snapshot[seal.seal_id] = seal.seal_hash;
    }
    if (group.length < 2) continue;

    let preferred = group[0];
    for (let i = 1; i < group.length; i++) {
      preferred = pickPreferredSeal(preferred, group[i]);
    }

    const hash_divergent = groupHasHashDivergence(group);
    collisions.push({
      block_number,
      candidate_seals: group.map(toCollisionAuditSeal).sort((a, b) => a.seal_id.localeCompare(b.seal_id)),
      hash_divergent,
      preferred_by_current_algorithm: preferred.seal_id,
      preference_rationale: buildPreferenceRationale(preferred, group),
      requires_human_review: hash_divergent,
      resolution_state: {
        algorithmically_preferred: preferred.seal_id,
        canonically_proven: null,
        human_approved: null,
      },
    });
  }

  const hash_divergent_group_count = collisions.filter((c) => c.hash_divergent).length;

  return {
    schema_version: COLLISION_AUDIT_SCHEMA_VERSION,
    cycle: options.cycle,
    audited_at,
    raw_attested_count: attested.length,
    unique_block_count: byNumber.size,
    collision_group_count: collisions.length,
    hash_divergent_group_count,
    critical: hash_divergent_group_count > 0,
    collisions,
    kv_snapshot,
  };
}

export function auditHasCriticalCollisions(report: CollisionAuditReport): boolean {
  return report.critical;
}
