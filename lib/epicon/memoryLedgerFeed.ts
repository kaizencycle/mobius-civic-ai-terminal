/**
 * In-memory EPICON ledger slice for preview / dev when Redis is absent (C-626).
 * Mirrors newest-first list semantics of mobius:epicon:feed.
 */

import type { EpiconLedgerFeedEntry } from '@/lib/epicon/ledgerFeedTypes';

const MAX = 500;
const entries: EpiconLedgerFeedEntry[] = [];

export function pushMemoryLedgerEntry(entry: EpiconLedgerFeedEntry): void {
  entries.unshift(entry);
  if (entries.length > MAX) {
    entries.length = MAX;
  }
}

export function getMemoryLedgerEntries(max = 100): EpiconLedgerFeedEntry[] {
  return entries.slice(0, max);
}
