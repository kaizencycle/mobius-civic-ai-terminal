'use client';

import { useMemo, useState } from 'react';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import { useLedgerChamber } from '@/hooks/useLedgerChamber';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import type { LedgerEntry } from '@/lib/terminal/types';
import AgentLedgerAdapterPanel from './AgentLedgerAdapterPanel';

// (rest of file unchanged until return)

export default function LedgerPageClient() {
  const { data, preview, full, error, stabilizationActive } = useLedgerChamber(true);
  const [sortKey, setSortKey] = useState<SortKey>('timestamp');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [scrollPage, setScrollPage] = useState(0);

  const feed = useMemo(() => (data ? ({ events: data.events, status: { cycleId: data.cycleId ?? data.events[0]?.cycleId ?? 'C-—' } } as EchoFeedResponse) : null), [data]);
  const rows = useMemo(() => feed?.events ?? [], [feed]);

  const deterministicCycle = currentCycleId();
  const freshness = data?.freshness;
  const activeCycle = freshness?.activeCycle ?? deterministicCycle;

  if (!feed) return <ChamberSkeleton blocks={10} />;

  return (
    <div className="flex h-full flex-col overflow-hidden p-4 text-xs">
      {/* NEW PANEL */}
      <AgentLedgerAdapterPanel activeCycle={activeCycle} />

      {/* EXISTING UI CONTINUES BELOW (unchanged) */}
    </div>
  );
}
