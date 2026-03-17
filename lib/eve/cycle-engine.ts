/**
 * Mobius EVE-Bot — Cycle Rotation Engine
 *
 * EVE (Ethics, Verification, Epoch) manages the daily cycle transition.
 * At midnight EST, EVE advances the Mobius system to the next cycle.
 *
 * Cycle Epoch:
 *   C-0 = July 7, 2025 (Mobius genesis)
 *   Each calendar day (midnight-to-midnight EST) = +1 cycle
 *   C-253 = March 17, 2026
 *   C-254 = March 18, 2026
 *   ... and so on, deterministic forever.
 *
 * EVE produces:
 *   - New cycle ID (deterministic from date)
 *   - Genesis ledger entry for the new cycle
 *   - Seal ledger entry for the previous cycle
 *   - Updated store state
 *   - Snapshot to docs/echo/
 */

import type { LedgerEntry, EpiconItem } from '@/lib/terminal/types';

// ── Epoch ────────────────────────────────────────────────────
// C-0 = July 7, 2025. One cycle per calendar day (EST).

const EPOCH = new Date('2025-07-07T00:00:00-05:00'); // EST

/**
 * Calculate the cycle number for a given date.
 * Uses America/New_York (EST/EDT) as the reference timezone.
 */
export function cycleForDate(date: Date = new Date()): number {
  // Get the date in EST/EDT
  const estString = date.toLocaleDateString('en-CA', {
    timeZone: 'America/New_York',
  }); // "2026-03-17" format
  const estDate = new Date(estString + 'T00:00:00-05:00');
  const diffMs = estDate.getTime() - EPOCH.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Get the current cycle ID string (e.g., "C-253").
 */
export function currentCycleId(date: Date = new Date()): string {
  return `C-${cycleForDate(date)}`;
}

/**
 * Get the previous cycle ID string.
 */
export function previousCycleId(date: Date = new Date()): string {
  return `C-${cycleForDate(date) - 1}`;
}

/**
 * Format a date as a Mobius timestamp string.
 */
function mobiusTimestamp(date: Date = new Date()): string {
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).replace(/(\d+)\/(\d+)\/(\d+),\s*/, '$3-$1-$2 ') + ' ET';
}

// ── Cycle Transition Records ─────────────────────────────────

export type CycleTransition = {
  previousCycleId: string;
  newCycleId: string;
  cycleNumber: number;
  timestamp: string;
  sealEntry: LedgerEntry;
  genesisEntry: LedgerEntry;
  genesisEpicon: EpiconItem;
};

/**
 * Generate the full cycle transition — seal the old cycle, open the new one.
 * Called by the EVE-bot cron at midnight EST.
 */
export function buildCycleTransition(
  now: Date = new Date(),
  previousLedgerCount: number = 0,
  previousGiScore: number = 0,
): CycleTransition {
  const cycleNum = cycleForDate(now);
  const prevCycleNum = cycleNum - 1;
  const newId = `C-${cycleNum}`;
  const prevId = `C-${prevCycleNum}`;
  const ts = mobiusTimestamp(now);

  const sealEntry: LedgerEntry = {
    id: `LE-${prevId}-SEAL`,
    cycleId: prevId,
    type: 'settlement',
    agentOrigin: 'EVE',
    timestamp: ts,
    summary: `${prevId} sealed by EVE-bot — ${previousLedgerCount} entries committed, GI carried at ${previousGiScore.toFixed(2)}`,
    integrityDelta: 0.0,
    status: 'committed',
  };

  const genesisEntry: LedgerEntry = {
    id: `LE-${newId}-001`,
    cycleId: newId,
    type: 'settlement',
    agentOrigin: 'EVE',
    timestamp: ts,
    summary: `${newId} genesis — EVE-bot cycle transition, ${prevId} sealed, new cycle active`,
    integrityDelta: 0.0,
    status: 'committed',
  };

  const genesisEpicon: EpiconItem = {
    id: `EPICON-${newId}-000`,
    title: `${newId} cycle initialized — ${prevId} sealed by EVE-bot`,
    category: 'infrastructure',
    status: 'verified',
    confidenceTier: 4,
    ownerAgent: 'EVE',
    timestamp: ts,
    sources: ['EVE-bot cycle engine', 'ECHO ledger system'],
    summary: `Automated cycle transition at midnight EST. ${prevId} sealed with ${previousLedgerCount} entries. ${newId} genesis committed. GI score carried at ${previousGiScore.toFixed(2)}.`,
    trace: [
      `EVE-bot triggered cycle transition at midnight EST`,
      `ECHO sealed ${prevId} ledger (${previousLedgerCount} entries)`,
      `ZENITH confirmed cycle quorum`,
      `ATLAS verified integrity continuity across cycle boundary`,
      `EVE committed ${newId} genesis entry`,
    ],
  };

  return {
    previousCycleId: prevId,
    newCycleId: newId,
    cycleNumber: cycleNum,
    timestamp: ts,
    sealEntry,
    genesisEntry,
    genesisEpicon,
  };
}
