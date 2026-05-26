/**
 * OPT-08 (C-323): Client-side cycle ID computation with deterministic
 * epoch fallback. Mirrors lib/eve/cycle-engine.ts server logic so the
 * terminal header never shows C-— after a cold boot.
 *
 * Epoch: C-0 = July 7, 2025 00:00 EST. One cycle per calendar day.
 */

const EPOCH_EST = '2025-07-07T00:00:00-05:00';

export function computeCurrentCycleId(date: Date = new Date()): string {
  try {
    const estDateStr = date.toLocaleDateString('en-CA', {
      timeZone: 'America/New_York',
    });
    const estMidnight = new Date(`${estDateStr}T00:00:00-05:00`);
    const epoch = new Date(EPOCH_EST);
    const diffDays = Math.floor((estMidnight.getTime() - epoch.getTime()) / (1000 * 60 * 60 * 24));
    return `C-${Math.max(0, diffDays)}`;
  } catch {
    return 'C-—';
  }
}

export function cycleAgeMs(cycleId: string, date: Date = new Date()): number | null {
  const num = parseInt(cycleId.replace('C-', ''), 10);
  if (!Number.isFinite(num)) return null;
  try {
    const epoch = new Date(EPOCH_EST);
    const cycleStart = new Date(epoch.getTime() + num * 24 * 3600 * 1000);
    return date.getTime() - cycleStart.getTime();
  } catch {
    return null;
  }
}
