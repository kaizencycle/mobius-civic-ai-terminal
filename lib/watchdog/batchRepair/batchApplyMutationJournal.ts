import { hashObject } from '@/lib/watchdog/batchRepair/stableHash';

export type BatchApplyWriteRecord = {
  key: string;
  before: string | null;
  after: string;
};

export type BatchApplyJournalOperation =
  | 'track_r_batch_apply_dry_run'
  | 'track_r_batch_apply_staging'
  | 'track_r_batch_apply_activation'
  | 'track_r_batch_apply_post_verify'
  | 'track_r_batch_apply_rollback_snapshot';

export type BatchApplyMutationJournalEntry = {
  at: string;
  operation: BatchApplyJournalOperation;
  repair_id: string;
  capture_id: string;
  mode: 'dry_run' | 'live_apply';
  lineage_snapshot_hash: string;
  execution_witness_hash: string;
  before: unknown;
  after: unknown;
  write_records?: readonly BatchApplyWriteRecord[];
};

export type BatchApplyMutationJournal = {
  journal_id: string;
  capture_id: string;
  repair_id: string;
  created_at: string;
  entries: readonly BatchApplyMutationJournalEntry[];
  journal_hash: string;
};

function freezeEntry(entry: BatchApplyMutationJournalEntry): BatchApplyMutationJournalEntry {
  return Object.freeze({
    ...entry,
    write_records: entry.write_records ? Object.freeze([...entry.write_records]) : undefined,
  });
}

export class InMemoryBatchApplyMutationJournal {
  private readonly entries: BatchApplyMutationJournalEntry[] = [];
  private finalized = false;

  constructor(
    readonly journal_id: string,
    readonly capture_id: string,
    readonly repair_id: string,
    readonly created_at: string,
  ) {}

  append(entry: BatchApplyMutationJournalEntry): void {
    if (this.finalized) {
      throw new Error('batch apply mutation journal is immutable after finalize');
    }
    this.entries.push(freezeEntry(entry));
  }

  hasCommittedActivation(repair_id: string): boolean {
    return this.entries.some(
      (entry) =>
        entry.repair_id === repair_id &&
        entry.operation === 'track_r_batch_apply_activation' &&
        entry.mode === 'live_apply',
    );
  }

  finalize(): BatchApplyMutationJournal {
    this.finalized = true;
    const frozenEntries = Object.freeze([...this.entries]);
    const journal: BatchApplyMutationJournal = Object.freeze({
      journal_id: this.journal_id,
      capture_id: this.capture_id,
      repair_id: this.repair_id,
      created_at: this.created_at,
      entries: frozenEntries,
      journal_hash: hashObject({
        journal_id: this.journal_id,
        capture_id: this.capture_id,
        repair_id: this.repair_id,
        entries: frozenEntries,
      }),
    });
    return journal;
  }
}

export function buildJournalId(args: {
  capture_id: string;
  repair_id: string;
  verified_at: string;
}): string {
  return hashObject({
    capture_id: args.capture_id,
    repair_id: args.repair_id,
    verified_at: args.verified_at,
  }).slice(0, 32);
}
