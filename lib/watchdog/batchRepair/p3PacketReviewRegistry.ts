import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const PACKET_REVIEW_REGISTRY_PATH =
  'docs/epicon/cycles/C-408/track-r-p3-review/packet-review-registry.json';

export const TRACK_R_P3_REVIEW_ARTIFACT_BASE =
  'docs/epicon/cycles/C-408/track-r-p3-review';

export type PacketReviewStatus =
  | 'discovered'
  | 'intake_verified'
  | 'awaiting_zeus'
  | 'awaiting_eve'
  | 'awaiting_human'
  | 'challenged'
  | 'adopted_for_handoff_consideration'
  | 'superseded';

export type PacketReviewRegistryEntry = {
  workflow_run_id: string;
  packet_hash: string;
  journal_id: string;
  journal_hash: string;
  observed_production_commit: string;
  capture_id: string;
  status: PacketReviewStatus;
  execution_authorized: false;
  discovered_at: string;
  intake_verified_at?: string;
  supersedes_workflow_run_id?: string;
  superseded_by_workflow_run_id?: string;
  zeus_review_status: 'awaiting_zeus' | 'intake_verified' | 'adopt' | 'challenge' | 'overturn';
  eve_review_status: 'awaiting_eve' | 'intake_verified' | 'adopt' | 'challenge' | 'overturn';
  human_review_status: 'awaiting_human' | 'pending' | 'approved' | 'rejected';
  zeus_review_artifact_path?: string;
  eve_review_artifact_path?: string;
  last_intake_at?: string;
};

export type PacketReviewRegistry = {
  schema_version: '1';
  note: string;
  entries: PacketReviewRegistryEntry[];
};

export type LoadPacketReviewRegistryResult =
  | { ok: true; registry: PacketReviewRegistry }
  | { ok: false; errors: string[] };

export function loadPacketReviewRegistry(repoRoot?: string): LoadPacketReviewRegistryResult {
  const path = join(repoRoot ?? process.cwd(), PACKET_REVIEW_REGISTRY_PATH);
  if (!existsSync(path)) {
    return {
      ok: true,
      registry: {
        schema_version: '1',
        note: 'Track R P3 packet review state — does not grant execution authority.',
        entries: [],
      },
    };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as PacketReviewRegistry;
    if (parsed.schema_version !== '1') {
      return { ok: false, errors: ['packet review registry schema_version must be 1'] };
    }
    if (!Array.isArray(parsed.entries)) {
      return { ok: false, errors: ['packet review registry entries must be an array'] };
    }
    return { ok: true, registry: parsed };
  } catch (error) {
    return {
      ok: false,
      errors: [
        `packet review registry unreadable: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}

export function findPacketReviewEntry(
  registry: PacketReviewRegistry,
  workflowRunId: string,
): PacketReviewRegistryEntry | undefined {
  return registry.entries.find((entry) => entry.workflow_run_id === workflowRunId);
}

export function upsertPacketReviewEntry(args: {
  registry: PacketReviewRegistry;
  entry: PacketReviewRegistryEntry;
}): PacketReviewRegistry {
  const existingIndex = args.registry.entries.findIndex(
    (row) => row.workflow_run_id === args.entry.workflow_run_id,
  );
  if (existingIndex === -1) {
    return { ...args.registry, entries: [...args.registry.entries, args.entry] };
  }
  const entries = [...args.registry.entries];
  entries[existingIndex] = args.entry;
  return { ...args.registry, entries };
}

export function writePacketReviewRegistry(args: {
  registry: PacketReviewRegistry;
  repoRoot?: string;
}): void {
  const path = join(args.repoRoot ?? process.cwd(), PACKET_REVIEW_REGISTRY_PATH);
  writeFileSync(path, `${JSON.stringify(args.registry, null, 2)}\n`, 'utf8');
}
