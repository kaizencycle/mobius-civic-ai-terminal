import type { Seal } from '@/lib/vault-v2/types';
import { alignFixtureMustPassBoundary41To42 } from '@/lib/watchdog/batchRepair/auditMetrics';
import type { C397Witness, CollisionResolutionTable } from '@/lib/watchdog/batchRepair/witnessResolution';
import { extractCanonicalAssignments, groupWitnessCollisions } from '@/lib/watchdog/batchRepair/witnessResolution';

function fixtureSeal(partial: {
  seal_id: string;
  sequence: number;
  cycle_at_seal: string;
  sealed_at: string;
  seal_hash: string;
  prev_seal_hash: string | null;
}): Seal {
  return {
    ...partial,
    reserve: 50,
    gi_at_seal: 0.95,
    mode_at_seal: 'green',
    source_entries: 1,
    deposit_hashes: [],
    attestations: {},
    status: 'attested',
    fountain_status: 'pending',
    fountain_emitted_at: null,
    posture: null,
  };
}

/** Build minimal attested seals from witness pairs for fixture dry-runs (no production KV). */
export function buildFixtureSealsFromWitness(
  witness: C397Witness,
  resolutionTable: CollisionResolutionTable,
): Seal[] {
  const seals: Seal[] = [];
  const seen = new Set<string>();

  for (const pair of witness.collisions) {
    for (const seal_id of [pair.kept_seal_id, pair.dropped_seal_id]) {
      if (seen.has(seal_id)) continue;
      seen.add(seal_id);
      const block_number = pair.block_number;
      const canonical = resolutionTable.block_canonical[String(block_number)]?.seal_id;
      const isCanonical = seal_id === canonical;
      seals.push(
        fixtureSeal({
          seal_id,
          sequence: block_number,
          cycle_at_seal: seal_id.match(/seal-C-(\d+)-/)?.[1]
            ? `C-${seal_id.match(/seal-C-(\d+)-/)![1]}`
            : 'C-403',
          sealed_at: isCanonical
            ? (resolutionTable.block_canonical[String(block_number)]?.sealed_at ??
              '2026-06-01T00:00:00.000Z')
            : pair.kept_seal_id === seal_id
              ? (pair.kept_sealed_at ?? '2026-07-01T00:00:00.000Z')
              : (pair.dropped_sealed_at ?? '2026-06-01T00:00:00.000Z'),
          seal_hash: `fixture-hash-${seal_id}`,
          prev_seal_hash: block_number > 1 ? `fixture-prev-${block_number - 1}` : null,
        }),
      );
    }
  }

  for (const block_number of witness.clean_block_numbers) {
    const soleId = `seal-clean-b${block_number}`;
    if (seen.has(soleId)) continue;
    seen.add(soleId);
    seals.push(
      fixtureSeal({
        seal_id: soleId,
        sequence: block_number,
        cycle_at_seal: 'C-403',
        sealed_at: '2026-06-15T00:00:00.000Z',
        seal_hash: `fixture-hash-${soleId}`,
        prev_seal_hash: block_number > 1 ? `fixture-prev-${block_number - 1}` : null,
      }),
    );
  }

  alignFixtureMustPassBoundary41To42({
    seals,
    canonical_assignments: extractCanonicalAssignments(resolutionTable),
    clean_block_numbers: witness.clean_block_numbers,
  });

  return seals.sort((a, b) => a.sequence - b.sequence || a.seal_id.localeCompare(b.seal_id));
}

export function sealsForContestedBlocks(
  witness: C397Witness,
  seals: Seal[],
): Seal[] {
  const contested = new Set(witness.contested_block_numbers);
  return seals.filter((s) => contested.has(s.sequence));
}

export function witnessCountsMatchExpected(witness: C397Witness): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const { counts } = witness;
  if (counts.unique_block_count !== 194) {
    errors.push(`unique_block_count expected 194, got ${counts.unique_block_count}`);
  }
  if (counts.contested_block_count !== 123) {
    errors.push(`contested_block_count expected 123, got ${counts.contested_block_count}`);
  }
  if (counts.collision_pair_count !== 125) {
    errors.push(`collision_pair_count expected 125, got ${counts.collision_pair_count}`);
  }
  if (counts.clean_block_count !== 71) {
    errors.push(`clean_block_count expected 71, got ${counts.clean_block_count}`);
  }
  if (witness.contested_block_numbers.length !== 123) {
    errors.push(
      `contested_block_numbers length expected 123, got ${witness.contested_block_numbers.length}`,
    );
  }
  if (witness.clean_block_numbers.length !== 71) {
    errors.push(
      `clean_block_numbers length expected 71, got ${witness.clean_block_numbers.length}`,
    );
  }
  const groups = groupWitnessCollisions(witness);
  if (groups.length !== 123) {
    errors.push(`grouped contested blocks expected 123, got ${groups.length}`);
  }
  return { ok: errors.length === 0, errors };
}
