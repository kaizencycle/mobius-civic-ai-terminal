/**
 * OPT-07 (C-323): Ledger fetch with explicit 5s timeout and degraded-state
 * return so the Ledger chamber never hangs indefinitely on cold API.
 * OPT-05 (C-324): 503 circuit breaker — when ledger returns 503 suspended,
 * open circuit for 3 min and serve last-known mock rather than hanging.
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
  suspended?: boolean;
  retryAfter?: number;
};

const LEDGER_TIMEOUT_MS = 5_000;
const LEDGER_503_COOLDOWN = 180_000;

let _ledger503At: number | null = null;

export async function getLedgerEntries(): Promise<LedgerResult> {
  const now = Date.now();

  // OPT-05: circuit breaker — skip probe until cooldown expires
  if (_ledger503At !== null && now - _ledger503At < LEDGER_503_COOLDOWN) {
    return {
      entries: mockLedger,
      source: 'mock',
      degraded: true,
      degradedReason: 'http-error',
      suspended: true,
      retryAfter: _ledger503At + LEDGER_503_COOLDOWN,
    };
  }

  const raw = await fetchWithRetry('/api/ledger/backfill', LEDGER_TIMEOUT_MS);

  if (raw && typeof raw === 'object') {
    const r = raw as { items?: unknown; error?: string; status?: number };
    // Detect 503 in error message or status field
    if (r.status === 503 || (typeof r.error === 'string' && r.error.includes('503'))) {
      _ledger503At = Date.now();
      return {
        entries: mockLedger,
        source: 'mock',
        degraded: true,
        degradedReason: 'http-error',
        suspended: true,
        retryAfter: _ledger503At + LEDGER_503_COOLDOWN,
      };
    }
    const items = r.items;
    if (Array.isArray(items) && items.length > 0) {
      _ledger503At = null; // reset circuit on success
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
