import { kvGet, kvGetOrThrow, kvSet } from '@/lib/kv/store';
import {
  loadPacketReviewRegistry,
  type LoadPacketReviewRegistryResult,
  type PacketReviewRegistry,
} from '@/lib/watchdog/batchRepair/p3PacketReviewRegistry';
import {
  trackRP3ReviewArtifactPath,
  type TrackRP3ReviewLane,
} from '@/lib/watchdog/batchRepair/trackRP3ReviewArtifacts';

export const TRACK_R_P3_REVIEW_REGISTRY_KV_KEY = 'track-r:p3-review:registry' as const;

export function trackRP3ReviewReceiptKvKey(args: {
  workflowRunId: string;
  lane: TrackRP3ReviewLane;
}): string {
  return `track-r:p3-review:receipt:${args.workflowRunId}:${args.lane.toLowerCase()}`;
}

export type TrackRP3ReviewReceiptRecord = {
  workflow_run_id: string;
  lane: TrackRP3ReviewLane;
  logical_path: string;
  content: string;
  generated_at: string;
  execution_authorized: false;
};

export type TrackRP3ReviewStateStore = {
  loadRegistry(): Promise<LoadPacketReviewRegistryResult>;
  saveRegistry(registry: PacketReviewRegistry): Promise<void>;
  saveReceipt(args: {
    workflowRunId: string;
    lane: TrackRP3ReviewLane;
    content: string;
    generatedAt: string;
  }): Promise<string>;
  loadReceipt(args: {
    workflowRunId: string;
    lane: TrackRP3ReviewLane;
  }): Promise<TrackRP3ReviewReceiptRecord | null>;
};

function emptyRegistry(): PacketReviewRegistry {
  return {
    schema_version: '1',
    note: 'Track R P3 packet review state — does not grant execution authority.',
    entries: [],
  };
}

export function loadTrackRP3ReviewRegistryFromKvRow(
  kvRow: PacketReviewRegistry | null | undefined,
  options?: { readFailed?: boolean; readError?: string },
): LoadPacketReviewRegistryResult {
  if (options?.readFailed) {
    return {
      ok: false,
      errors: [
        options.readError ??
          'Track R P3 review registry KV read failed — intake blocked to avoid wiping live state',
      ],
    };
  }
  if (kvRow == null) {
    return { ok: true, registry: emptyRegistry() };
  }
  if (kvRow.schema_version !== '1' || !Array.isArray(kvRow.entries)) {
    return {
      ok: false,
      errors: ['Track R P3 review registry KV payload is malformed — intake blocked'],
    };
  }
  return { ok: true, registry: kvRow };
}

export class KvTrackRP3ReviewStateStore implements TrackRP3ReviewStateStore {
  async loadRegistry(): Promise<LoadPacketReviewRegistryResult> {
    try {
      const kvRow = await kvGetOrThrow<PacketReviewRegistry>(TRACK_R_P3_REVIEW_REGISTRY_KV_KEY);
      return loadTrackRP3ReviewRegistryFromKvRow(kvRow);
    } catch (error) {
      return loadTrackRP3ReviewRegistryFromKvRow(null, {
        readFailed: true,
        readError: `Track R P3 review registry KV read failed — intake blocked to avoid wiping live state: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  }

  async saveRegistry(registry: PacketReviewRegistry): Promise<void> {
    const saved = await kvSet(TRACK_R_P3_REVIEW_REGISTRY_KV_KEY, registry);
    if (!saved) {
      throw new Error('Track R P3 review registry KV write failed — intake blocked');
    }
  }

  async saveReceipt(args: {
    workflowRunId: string;
    lane: TrackRP3ReviewLane;
    content: string;
    generatedAt: string;
  }): Promise<string> {
    const logicalPath = trackRP3ReviewArtifactPath({
      workflowRunId: args.workflowRunId,
      lane: args.lane,
    });
    await kvSet(trackRP3ReviewReceiptKvKey({ workflowRunId: args.workflowRunId, lane: args.lane }), {
      workflow_run_id: args.workflowRunId,
      lane: args.lane,
      logical_path: logicalPath,
      content: args.content,
      generated_at: args.generatedAt,
      execution_authorized: false as const,
    } satisfies TrackRP3ReviewReceiptRecord);
    return logicalPath;
  }

  async loadReceipt(args: {
    workflowRunId: string;
    lane: TrackRP3ReviewLane;
  }): Promise<TrackRP3ReviewReceiptRecord | null> {
    return kvGet<TrackRP3ReviewReceiptRecord>(
      trackRP3ReviewReceiptKvKey({ workflowRunId: args.workflowRunId, lane: args.lane }),
    );
  }
}

export class InMemoryTrackRP3ReviewStateStore implements TrackRP3ReviewStateStore {
  private registry: PacketReviewRegistry | null = null;
  private readonly receipts = new Map<string, TrackRP3ReviewReceiptRecord>();

  constructor(private readonly repoRoot?: string) {}

  async loadRegistry(): Promise<LoadPacketReviewRegistryResult> {
    if (this.registry) return { ok: true, registry: this.registry };
    const seeded = loadPacketReviewRegistry(this.repoRoot);
    if (seeded.ok) this.registry = seeded.registry;
    return seeded;
  }

  async saveRegistry(registry: PacketReviewRegistry): Promise<void> {
    this.registry = registry;
  }

  async saveReceipt(args: {
    workflowRunId: string;
    lane: TrackRP3ReviewLane;
    content: string;
    generatedAt: string;
  }): Promise<string> {
    const logicalPath = trackRP3ReviewArtifactPath({
      workflowRunId: args.workflowRunId,
      lane: args.lane,
    });
    const key = trackRP3ReviewReceiptKvKey({ workflowRunId: args.workflowRunId, lane: args.lane });
    this.receipts.set(key, {
      workflow_run_id: args.workflowRunId,
      lane: args.lane,
      logical_path: logicalPath,
      content: args.content,
      generated_at: args.generatedAt,
      execution_authorized: false,
    });
    return logicalPath;
  }

  async loadReceipt(args: {
    workflowRunId: string;
    lane: TrackRP3ReviewLane;
  }): Promise<TrackRP3ReviewReceiptRecord | null> {
    return this.receipts.get(trackRP3ReviewReceiptKvKey(args)) ?? null;
  }
}
