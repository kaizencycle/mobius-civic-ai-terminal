import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import {
  CAPTURE_2014Z_EXPECTED_HASHES,
  CAPTURE_2014Z_ID,
} from '@/lib/watchdog/batchRepair/trackRCaptureV2Governance';
import type { InMemoryBatchApplyMutationJournal } from '@/lib/watchdog/batchRepair/batchApplyMutationJournal';
import { LINEAGE_ACTIVE_VERSION_KEY, type LineageStore } from '@/lib/watchdog/batchRepair/versionedStaging';

export const TRACK_R_V2_EXECUTION_HANDOFF_PATH =
  'artifacts/C-404/track-r-lineage-v2/TRACK_R_V2_EXECUTION_HANDOFF_SIGNED.md';

export const TRACK_R_ALLOW_PRODUCTION_WRITES_ENV = 'TRACK_R_ALLOW_PRODUCTION_WRITES';

const V2_HASH_LABELS = [
  'semantic_manifest_hash',
  'lineage_snapshot_hash',
  'execution_witness_hash',
  'rollback_manifest_hash',
] as const;

export function validateV2ExecutionHandoff(args?: {
  repoRoot?: string;
  handoffPath?: string;
}): { ok: boolean; errors: string[]; path: string } {
  const repoRoot = args?.repoRoot ?? process.cwd();
  const path = args?.handoffPath
    ? isAbsolute(args.handoffPath)
      ? args.handoffPath
      : join(repoRoot, args.handoffPath)
    : join(repoRoot, TRACK_R_V2_EXECUTION_HANDOFF_PATH);
  const errors: string[] = [];

  if (!existsSync(path)) {
    return {
      ok: false,
      errors: [`P3 one-shot execution handoff missing: ${path}`],
      path,
    };
  }

  const content = readFileSync(path, 'utf8');
  if (!content.includes(CAPTURE_2014Z_ID)) {
    errors.push('execution handoff missing Capture #9 binding');
  }
  for (const label of V2_HASH_LABELS) {
    const hash = CAPTURE_2014Z_EXPECTED_HASHES[label];
    if (!content.includes(hash)) {
      errors.push(`execution handoff missing hash binding for ${label}`);
    }
  }
  if (
    !content.includes('ONE_SHOT_EXECUTION_AUTHORIZED') &&
    !content.includes('one_shot_execution_authorized: true')
  ) {
    errors.push('execution handoff missing explicit one-shot authorization marker');
  }

  return { ok: errors.length === 0, errors, path };
}

export function assertOneShotApplyNotConsumed(args: {
  journal: InMemoryBatchApplyMutationJournal;
  repair_id: string;
  store?: LineageStore;
}): { ok: boolean; errors: string[] } {
  if (args.journal.hasCommittedActivation(args.repair_id)) {
    return {
      ok: false,
      errors: [
        `one-shot guard: repair_id ${args.repair_id} already has a committed live activation in mutation journal`,
      ],
    };
  }
  if (args.store?.get(LINEAGE_ACTIVE_VERSION_KEY) === args.repair_id) {
    return {
      ok: false,
      errors: [
        `one-shot guard: repair_id ${args.repair_id} is already the active lineage version`,
      ],
    };
  }
  return { ok: true, errors: [] };
}

export function isProductionWriteArmEnabled(): boolean {
  return process.env[TRACK_R_ALLOW_PRODUCTION_WRITES_ENV]?.trim().toLowerCase() === 'true';
}
