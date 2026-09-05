/**
 * C-425 — Canonical chain-continuation planning.
 *
 * Proves what the next Reserve Block candidate sequence *should* be under the
 * effective Track R lineage, without touching `vault:seal:latest`
 * (`LATEST_SEAL_KEY`) at all. `lib/vault-v2/seal.ts` currently derives the next
 * candidate sequence from `getLatestSeal()` unconditionally; if that pointer is
 * ever left on an unresolved or quarantined branch after a collision, the very
 * next candidate would collide again. This module only *plans* the correct
 * continuation target — reusing the existing fail-closed C-373 resolver
 * (`newestResolvedCanonicalSeal`) — so a human-authorized repair step
 * (`lib/watchdog/latestSealPointerRepair.ts`, unchanged by this PR) can apply
 * it later. No pointer mutation happens here.
 */

import type { Seal } from '@/lib/vault-v2/types';
import { newestResolvedCanonicalSeal } from '@/lib/watchdog/canonicalLineageResolve';
import {
  getEffectiveCanonicalLineage,
  type EffectiveCanonicalLineage,
} from '@/lib/watchdog/effectiveCanonicalLineage';

export type CanonicalContinuationPlan =
  | {
      ok: true;
      target_seal_id: string;
      target_sequence: number;
      next_sequence: number;
      active_track_r_version: string;
    }
  | {
      ok: false;
      reason: 'lineage_untrusted' | 'unresolved_collision_blocks' | 'no_resolved_canonical_seal';
      detail: string;
      unresolved_block_numbers?: number[];
    };

/** Pure: given seals and an already-resolved lineage snapshot, plan continuation. */
export function planCanonicalContinuation(args: {
  seals: Seal[];
  lineage: EffectiveCanonicalLineage;
}): CanonicalContinuationPlan {
  if (!args.lineage.ok) {
    return {
      ok: false,
      reason: 'lineage_untrusted',
      detail: `effective Track R lineage unavailable: ${args.lineage.reason} (${args.lineage.detail})`,
    };
  }

  const { target, unresolved_blocks } = newestResolvedCanonicalSeal({
    seals: args.seals,
    quarantined: args.lineage.quarantined,
    canonicalIndex: args.lineage.canonical_index,
  });

  if (unresolved_blocks.length > 0) {
    return {
      ok: false,
      reason: 'unresolved_collision_blocks',
      detail: `cannot plan continuation while ${unresolved_blocks.length} block(s) remain unresolved`,
      unresolved_block_numbers: unresolved_blocks,
    };
  }
  if (!target) {
    return {
      ok: false,
      reason: 'no_resolved_canonical_seal',
      detail: 'no resolved canonical attested seal found under active lineage',
    };
  }

  return {
    ok: true,
    target_seal_id: target.seal_id,
    target_sequence: target.sequence,
    next_sequence: target.sequence + 1,
    active_track_r_version: args.lineage.active_version,
  };
}

/** KV-integrated entry point: loads the effective lineage, then plans continuation. */
export async function planCanonicalContinuationLive(seals: Seal[]): Promise<CanonicalContinuationPlan> {
  const lineage = await getEffectiveCanonicalLineage();
  return planCanonicalContinuation({ seals, lineage });
}

export type ChainHeadAlignment =
  | {
      aligned: true;
      canonical_target_seal_id: string;
      canonical_target_sequence: number;
    }
  | {
      aligned: false;
      reason: 'lineage_untrusted' | 'plan_unavailable' | 'pointer_missing' | 'pointer_mismatch';
      detail: string;
      canonical_target_seal_id?: string;
    };

/**
 * Chain-head safety (C-425 corrected handoff, Implementation 5): resolving every
 * historical collision is not by itself sufficient to resume candidate formation.
 * `vault:seal:latest` must also actually point at the newest RESOLVED canonical
 * seal — otherwise the very next candidate (`lib/vault-v2/seal.ts`'s
 * `sequence = prevSeal.sequence + 1`) would continue from an unresolved or
 * quarantined branch and could collide again immediately. Pure: takes the live
 * pointer as an explicit argument rather than reading it, so this is directly
 * testable without KV and the caller controls exactly when it's worth checking
 * (only meaningful once there is a resolved canonical target to compare against).
 */
export function verifyChainHeadAligned(args: {
  seals: Seal[];
  lineage: EffectiveCanonicalLineage;
  latestSealId: string | null;
}): ChainHeadAlignment {
  if (!args.lineage.ok) {
    return {
      aligned: false,
      reason: 'lineage_untrusted',
      detail: `effective Track R lineage unavailable: ${args.lineage.reason} (${args.lineage.detail})`,
    };
  }

  const plan = planCanonicalContinuation({ seals: args.seals, lineage: args.lineage });
  if (!plan.ok) {
    return { aligned: false, reason: 'plan_unavailable', detail: plan.detail };
  }

  if (!args.latestSealId) {
    return {
      aligned: false,
      reason: 'pointer_missing',
      detail: `vault:seal:latest is not set while a resolved canonical target (${plan.target_seal_id}) exists`,
      canonical_target_seal_id: plan.target_seal_id,
    };
  }

  if (args.latestSealId !== plan.target_seal_id) {
    return {
      aligned: false,
      reason: 'pointer_mismatch',
      detail: `vault:seal:latest (${args.latestSealId}) does not match the resolved canonical head (${plan.target_seal_id})`,
      canonical_target_seal_id: plan.target_seal_id,
    };
  }

  return {
    aligned: true,
    canonical_target_seal_id: plan.target_seal_id,
    canonical_target_sequence: plan.target_sequence,
  };
}
