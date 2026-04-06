/**
 * Normalize EVE governance synthesis source strings for ledger + feed (C-270).
 * Sonar-enriched rows use a suffixed source; consumers treat all as eve-synthesis.
 */

export const EVE_LEDGER_SYNTHESIS_SOURCE = 'eve-synthesis' as const;

/** Ledger / KV may store suffixed variants (e.g. +sonar); idempotency and feed must match all. */
export function isEveSynthesisLedgerSource(source: string | undefined): boolean {
  if (typeof source !== 'string' || !source) return false;
  return source === EVE_LEDGER_SYNTHESIS_SOURCE || source.startsWith('eve-synthesis+');
}

/** Alias for UI / feed consumers (same matching rules as ledger idempotency). */
export const isEveSynthesisFeedSource = isEveSynthesisLedgerSource;
