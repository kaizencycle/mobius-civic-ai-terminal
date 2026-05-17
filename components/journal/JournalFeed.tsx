'use client';

import { useMemo } from 'react';
import type { JournalFeedCardEntry } from '@/components/journal/types';
import type { ViewMode } from '@/components/journal/JournalToolbar';
import { JOURNAL_AGENT_COLORS } from '@/components/journal/JournalToolbar';
import { JournalEntryCard } from '@/components/journal/JournalEntryCard';

export type JournalFeedProps = {
  entries: JournalFeedCardEntry[];
  view: ViewMode;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onRelatedClick?: (journalEntryId: string) => void;
  registerAnchor?: (id: string, el: HTMLElement | null) => void;
};

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce(
    (acc, item) => {
      const k = String(item[key]);
      (acc[k] ??= []).push(item);
      return acc;
    },
    {} as Record<string, T[]>,
  );
}

export function JournalFeed({
  entries,
  view,
  expandedIds,
  onToggleExpand,
  onRelatedClick,
  registerAnchor,
}: JournalFeedProps) {
  const sorted = useMemo(() => [...entries], [entries]);

  if (sorted.length === 0) {
    return <div className="py-16 text-center text-sm text-slate-500">No entries match the current filter.</div>;
  }

  if (view === 'feed') {
    return (
      <>
        {sorted.map((e) => (
          <JournalEntryCard
            key={e.id}
            entry={e}
            expanded={expandedIds.has(e.id)}
            onToggleExpand={() => onToggleExpand(e.id)}
            onRelatedClick={onRelatedClick}
            registerAnchor={registerAnchor}
          />
        ))}
      </>
    );
  }

  if (view === 'by-cycle') {
    const byCycle = groupBy(sorted, 'cycle');
    return (
      <>
        {Object.entries(byCycle)
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([cycle, ents]) => (
            <div key={cycle} className="mb-5">
              <div className="mb-2 flex items-center gap-2 border-b border-slate-800 pb-1.5 dark:border-slate-700">
                <span className="text-xs font-medium text-slate-300">{cycle}</span>
                <span className="text-xs text-slate-500">{ents.length} entries</span>
              </div>
              {ents.map((e) => (
                <JournalEntryCard
                  key={e.id}
                  entry={e}
                  expanded={expandedIds.has(e.id)}
                  onToggleExpand={() => onToggleExpand(e.id)}
                  onRelatedClick={onRelatedClick}
                  registerAnchor={registerAnchor}
                />
              ))}
            </div>
          ))}
      </>
    );
  }

  if (view === 'by-agent') {
    const byAgent = groupBy(sorted, 'agent');
    return (
      <>
        {Object.entries(byAgent)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([agent, ents]) => {
            const color = JOURNAL_AGENT_COLORS[agent] ?? '#888';
            return (
              <div key={agent} className="mb-5">
                <div
                  className="mb-2 flex items-center gap-2 pb-1.5"
                  style={{ borderBottom: `1px solid ${color}33` }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                  <span className="text-xs font-medium" style={{ color }}>
                    {agent}
                  </span>
                  <span className="text-xs text-slate-500">{ents.length} entries</span>
                </div>
                {ents.map((e) => (
                  <JournalEntryCard
                    key={e.id}
                    entry={e}
                    expanded={expandedIds.has(e.id)}
                    onToggleExpand={() => onToggleExpand(e.id)}
                    onRelatedClick={onRelatedClick}
                    registerAnchor={registerAnchor}
                  />
                ))}
              </div>
            );
          })}
      </>
    );
  }

  return null;
}
