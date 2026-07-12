/**
 * Hot KV seal hash lineage analysis — walks prev_seal_hash links across attested seals.
 * EPICON: C-370 chain-continuity-audit
 */

import type { Seal } from '@/lib/vault-v2/types';
import { verifySealHash } from '@/lib/vault-v2/seal';

export type SealLinkIssue = {
  seal_id: string;
  sequence: number;
  cycle: string;
  issue: 'orphan_prev' | 'hash_invalid' | 'genesis_non_null_prev';
  prev_seal_hash: string | null;
  detail?: string;
};

export type LineageComponent = {
  id: string;
  genesis_seals: string[];
  tip_seals: string[];
  seal_count: number;
  sequence_min: number;
  sequence_max: number;
  cycles: string[];
  fountain_statuses: string[];
};

export type ReattestCluster = {
  attested_at_hour: string;
  seal_count: number;
  sequence_range: [number, number];
  cycles: string[];
  sample_seal_ids: string[];
};

export type SealHashLineageReport = {
  attested_count: number;
  hash_valid_count: number;
  hash_invalid_count: number;
  genesis_count: number;
  link_issues: SealLinkIssue[];
  components: LineageComponent[];
  reattest_clusters: ReattestCluster[];
  /** True when more than one attested lineage component exists. */
  multiple_lineages: boolean;
};

function attestedSeals(seals: Seal[]): Seal[] {
  return seals.filter((s) => s.status === 'attested');
}

function groupReattestClusters(seals: Seal[]): ReattestCluster[] {
  const buckets = new Map<string, Seal[]>();
  for (const seal of seals) {
    const at = seal.substrate_attested_at;
    if (!at) continue;
    const hour = at.slice(0, 13);
    const list = buckets.get(hour) ?? [];
    list.push(seal);
    buckets.set(hour, list);
  }

  const clusters: ReattestCluster[] = [];
  for (const [hour, group] of buckets) {
    if (group.length < 5) continue;
    const sealedSpreadMs =
      Math.max(...group.map((s) => Date.parse(s.sealed_at))) -
      Math.min(...group.map((s) => Date.parse(s.sealed_at)));
    if (sealedSpreadMs < 7 * 24 * 60 * 60 * 1000) continue;
    const sequences = group.map((s) => s.sequence).sort((a, b) => a - b);
    clusters.push({
      attested_at_hour: hour,
      seal_count: group.length,
      sequence_range: [sequences[0], sequences[sequences.length - 1]],
      cycles: [...new Set(group.map((s) => s.cycle_at_seal))].sort(),
      sample_seal_ids: group.slice(0, 5).map((s) => s.seal_id),
    });
  }
  return clusters.sort((a, b) => b.seal_count - a.seal_count);
}

export function analyzeSealHashLineage(seals: Seal[]): SealHashLineageReport {
  const attested = attestedSeals(seals);
  const byHash = new Map<string, Seal>();
  const byId = new Map<string, Seal>();
  for (const seal of attested) {
    byHash.set(seal.seal_hash, seal);
    byId.set(seal.seal_id, seal);
  }

  const linkIssues: SealLinkIssue[] = [];
  let hashValidCount = 0;
  let hashInvalidCount = 0;
  let genesisCount = 0;

  for (const seal of attested) {
    if (verifySealHash(seal)) {
      hashValidCount++;
    } else {
      hashInvalidCount++;
      linkIssues.push({
        seal_id: seal.seal_id,
        sequence: seal.sequence,
        cycle: seal.cycle_at_seal,
        issue: 'hash_invalid',
        prev_seal_hash: seal.prev_seal_hash,
      });
    }

    if (seal.prev_seal_hash === null) {
      genesisCount++;
      continue;
    }

    if (!byHash.has(seal.prev_seal_hash)) {
      linkIssues.push({
        seal_id: seal.seal_id,
        sequence: seal.sequence,
        cycle: seal.cycle_at_seal,
        issue: 'orphan_prev',
        prev_seal_hash: seal.prev_seal_hash,
        detail: 'prev_seal_hash not found among attested seals',
      });
    }
  }

  const childHashes = new Set(
    attested.map((s) => s.prev_seal_hash).filter((h): h is string => h !== null),
  );
  const visited = new Set<string>();
  const components: LineageComponent[] = [];

  for (const seal of attested) {
    if (childHashes.has(seal.seal_hash) || visited.has(seal.seal_id)) continue;

    const stack = [seal];
    const componentSeals: Seal[] = [];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current.seal_id)) continue;
      visited.add(current.seal_id);
      componentSeals.push(current);
      for (const candidate of attested) {
        if (candidate.prev_seal_hash === current.seal_hash && !visited.has(candidate.seal_id)) {
          stack.push(candidate);
        }
      }
      if (current.prev_seal_hash) {
        const parent = byHash.get(current.prev_seal_hash);
        if (parent && !visited.has(parent.seal_id)) {
          stack.push(parent);
        }
      }
    }

    if (componentSeals.length === 0) continue;
    const sequences = componentSeals.map((s) => s.sequence);
    const genesis = componentSeals.filter((s) => s.prev_seal_hash === null).map((s) => s.seal_id);
    const tips = componentSeals
      .filter((s) => !attested.some((o) => o.prev_seal_hash === s.seal_hash))
      .map((s) => s.seal_id);

    components.push({
      id: `lineage-${genesis[0] ?? componentSeals[0].seal_id}`,
      genesis_seals: genesis,
      tip_seals: tips,
      seal_count: componentSeals.length,
      sequence_min: Math.min(...sequences),
      sequence_max: Math.max(...sequences),
      cycles: [...new Set(componentSeals.map((s) => s.cycle_at_seal))].sort(),
      fountain_statuses: [...new Set(componentSeals.map((s) => s.fountain_status))].sort(),
    });
  }

  components.sort((a, b) => b.seal_count - a.seal_count);

  return {
    attested_count: attested.length,
    hash_valid_count: hashValidCount,
    hash_invalid_count: hashInvalidCount,
    genesis_count: genesisCount,
    link_issues: linkIssues,
    components,
    reattest_clusters: groupReattestClusters(attested),
    multiple_lineages: components.length > 1,
  };
}
