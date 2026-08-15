import { join } from 'node:path';
import {
  buildBatchManifest,
  buildFixtureSealsFromWitness,
  loadResolutionTableFromFile,
  loadWitnessFromFile,
} from '@/lib/watchdog/batchRepair';
import type { CollisionRepairBatchManifest } from '@/lib/watchdog/batchRepair/types';

const FIXTURE_DIR = join(process.cwd(), 'docs/epicon/cycles/C-403/fixtures');
const WITNESS_PATH = join(FIXTURE_DIR, 'C403_RESERVE_BLOCK_COLLISION_WITNESS.pin.json');
const TABLE_PATH = join(FIXTURE_DIR, 'C403_COLLISION_RESOLUTION_TABLE.pin.json');
const CREATED_AT = '2026-08-14T00:00:00.000Z';

export const PINNED_WITNESS = loadWitnessFromFile(WITNESS_PATH);

export const COMMIT_GUARD_BASE = {
  dry_run: false as const,
  execution_feature_flag_enabled: true,
  explicit_operator_command: true,
  pinned_witness: PINNED_WITNESS,
  integrity_gate_active: true,
  mutation_journal_available: true,
  rollback_plan_verified: true,
};

export function loadFixtures(): {
  witness: ReturnType<typeof loadWitnessFromFile>;
  table: ReturnType<typeof loadResolutionTableFromFile>;
  seals: ReturnType<typeof buildFixtureSealsFromWitness>;
  manifest: CollisionRepairBatchManifest;
} {
  const witness = loadWitnessFromFile(WITNESS_PATH);
  const table = loadResolutionTableFromFile(TABLE_PATH);
  const seals = buildFixtureSealsFromWitness(witness, table);
  const manifest = buildBatchManifest({
    witness,
    resolutionTable: table,
    seals,
    created_at: CREATED_AT,
  });
  return { witness, table, seals, manifest };
}
