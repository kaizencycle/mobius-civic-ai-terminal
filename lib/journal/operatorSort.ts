import type { JournalDisplayEntry, JournalDisplaySeverity, JournalDisplayStatus } from '@/lib/journal/types';

function parseCycleOrdinal(cycle: string | undefined): number {
  const c = cycle?.trim() ?? '';
  const n = parseInt(c.replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function statusRank(s: JournalDisplayStatus | undefined): number {
  if (s === 'verified') return 4;
  if (s === 'committed') return 3;
  if (s === 'contested') return 2;
  if (s === 'draft') return 1;
  return 2;
}

function severityRank(s: JournalDisplaySeverity | undefined): number {
  if (s === 'critical') return 3;
  if (s === 'elevated') return 2;
  if (s === 'nominal') return 1;
  return 0;
}

/** Mobius operator ordering: current cycle, cycle ordinal, status, severity, confidence, time. */
export function sortJournalOperatorFirst(rows: JournalDisplayEntry[], focusCycleId: string): JournalDisplayEntry[] {
  const focus = focusCycleId.trim();
  return [...rows].sort((a, b) => {
    const aCurrent = (a.cycle?.trim() ?? '') === focus ? 1 : 0;
    const bCurrent = (b.cycle?.trim() ?? '') === focus ? 1 : 0;
    if (aCurrent !== bCurrent) return bCurrent - aCurrent;
    const cycA = parseCycleOrdinal(a.cycle);
    const cycB = parseCycleOrdinal(b.cycle);
    if (cycA !== cycB) return cycB - cycA;
    const stA = statusRank(a.status);
    const stB = statusRank(b.status);
    if (stA !== stB) return stB - stA;
    const sevA = severityRank(a.severity);
    const sevB = severityRank(b.severity);
    if (sevA !== sevB) return sevB - sevA;
    const confA = typeof a.confidence === 'number' && Number.isFinite(a.confidence) ? a.confidence : -1;
    const confB = typeof b.confidence === 'number' && Number.isFinite(b.confidence) ? b.confidence : -1;
    if (confA !== confB) return confB - confA;
    return new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime();
  });
}

export function sortJournalChronological(rows: JournalDisplayEntry[], order: 'asc' | 'desc'): JournalDisplayEntry[] {
  return [...rows].sort((a, b) => {
    const ta = new Date(a.timestamp ?? 0).getTime();
    const tb = new Date(b.timestamp ?? 0).getTime();
    return order === 'desc' ? tb - ta : ta - tb;
  });
}

export function sortJournalByAgent(rows: JournalDisplayEntry[]): JournalDisplayEntry[] {
  return [...rows].sort((a, b) => {
    const cmp = (a.agent ?? '').localeCompare(b.agent ?? '');
    if (cmp !== 0) return cmp;
    return new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime();
  });
}

export function sortJournalByCycle(rows: JournalDisplayEntry[]): JournalDisplayEntry[] {
  return [...rows].sort((a, b) => {
    const cmp = (b.cycle ?? '').localeCompare(a.cycle ?? '');
    if (cmp !== 0) return cmp;
    return new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime();
  });
}
