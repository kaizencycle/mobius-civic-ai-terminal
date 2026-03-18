'use client';

import { useEffect, useMemo, useState } from 'react';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import type { LedgerEntry } from '@/lib/terminal/types';

export type TerminalFreshnessSnapshot = {
  lastLedgerSyncLabel: string;
  lastIngestLabel: string;
  lastCycleAdvanceLabel: string;
};

function formatRelative(timestamp?: string | null) {
  if (!timestamp) return 'unknown';

  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) return timestamp;

  const deltaMs = Date.now() - value.getTime();
  const deltaMinutes = Math.round(deltaMs / 60000);

  if (Math.abs(deltaMinutes) < 1) return 'just now';
  if (Math.abs(deltaMinutes) < 60) return `${deltaMinutes}m ago`;

  const deltaHours = Math.round(deltaMinutes / 60);
  if (Math.abs(deltaHours) < 24) return `${deltaHours}h ago`;

  const deltaDays = Math.round(deltaHours / 24);
  return `${deltaDays}d ago`;
}

function formatMobiusTimestamp(timestamp?: string | null) {
  if (!timestamp) return 'unknown';
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) return timestamp;
  return value.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function useTerminalFreshness(ledger: LedgerEntry[]) {
  const [lastIngest, setLastIngest] = useState<string | null>(null);
  const [lastCycleAdvance, setLastCycleAdvance] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const [echoRes, cycleRes] = await Promise.all([
          fetch('/api/echo/feed', { cache: 'no-store' }),
          fetch('/api/eve/cycle-advance', { cache: 'no-store' }),
        ]);

        if (!mounted) return;

        if (echoRes.ok) {
          const echo = await echoRes.json();
          setLastIngest(echo?.status?.lastIngest ?? null);
        }

        if (cycleRes.ok) {
          const cycle = await cycleRes.json();
          setLastCycleAdvance(cycle?.timestamp ?? null);
        }
      } catch {
        if (!mounted) return;
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    load();
    const interval = window.setInterval(load, 60000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  const freshestLedger = ledger[0]?.timestamp;

  const freshness = useMemo<TerminalFreshnessSnapshot>(() => ({
    lastLedgerSyncLabel: freshestLedger ? formatMobiusTimestamp(freshestLedger) : 'awaiting ledger',
    lastIngestLabel: formatRelative(lastIngest),
    lastCycleAdvanceLabel:
      lastCycleAdvance ? `${currentCycleId(new Date(lastCycleAdvance))} · ${formatMobiusTimestamp(lastCycleAdvance)}` : 'unknown',
  }), [freshestLedger, lastIngest, lastCycleAdvance]);

  return { freshness, isLoading };
}
