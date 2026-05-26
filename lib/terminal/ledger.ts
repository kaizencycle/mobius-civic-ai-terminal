/**
 * OPT-07 (C-323): Ledger fetch with explicit 5s timeout and degraded-state
 * return so the Ledger chamber never hangs indefinitely on cold API.
 */

import type { LedgerEntry } from './types';
import { mockLedger } from './mock';
import { fetchWithRetry } from './api-client';

export type LedgerSource = 'live' | 'backfill' | 'mock';
export type LedgerDegradedReason = 'timeout' | 'http-error' | 'empty' | null;

export type LedgerResult = {
  entries: LedgerEntry[];
  source: LedgerSource;
  degraded: boolean;
  degradedReason: LedgerDegradedReason;
};

const LEDGER_TIMEOUT_MS = 5_000;

export async function getLedgerEntries(): Promise<LedgerResult> {
  const raw = await fetchWithRetry('/api/ledger/backfill', LEDGER_TIMEOUT_MS);

  if (raw && typeof raw === 'object') {
    const items = (raw as { items?: unknown }).items;
    if (Array.isArray(items) && items.length > 0) {
      return {
        entries: items as LedgerEntry[],
        source: 'backfill',
        degraded: false,
        degradedReason: null,
      };
    }
    return {
      entries: mockLedger,
      source: 'mock',
      degraded: true,
      degradedReason: 'empty',
    };
  }

  return {
    entries: mockLedger,
    source: 'mock',
    degraded: true,
    degradedReason: 'timeout',
  };
}
