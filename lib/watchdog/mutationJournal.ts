/**
 * C-373 repair mutation journal — append-only derived-index change log.
 */

import { kvGet, kvSet } from '@/lib/kv/store';

export const MUTATION_JOURNAL_KEY = 'watchdog:collision:mutation-journal';

export type MutationOperation =
  | 'set_canonical_block'
  | 'quarantine_seal'
  | 'repair_latest_pointer'
  | 'append_receipt';

export type MutationJournalEntry = {
  at: string;
  operation: MutationOperation;
  receipt_id: string;
  before: unknown;
  after: unknown;
};

export async function appendMutationJournal(entry: MutationJournalEntry): Promise<void> {
  const journal = (await kvGet<MutationJournalEntry[]>(MUTATION_JOURNAL_KEY)) ?? [];
  journal.push(entry);
  await kvSet(MUTATION_JOURNAL_KEY, journal);
}

export async function readMutationJournal(): Promise<MutationJournalEntry[]> {
  return (await kvGet<MutationJournalEntry[]>(MUTATION_JOURNAL_KEY)) ?? [];
}
