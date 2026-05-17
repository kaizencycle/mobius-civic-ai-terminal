'use client';

import { useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import DerivedFromChain from '@/components/terminal/journal/DerivedFromChain';
import type { JournalFeedCardEntry } from '@/components/journal/types';
import { JOURNAL_AGENT_COLORS } from '@/components/journal/JournalToolbar';

const LANE_STYLES = {
  HOT: { bg: 'bg-red-950/40', text: 'text-red-300', label: 'HOT' },
  CANON: { bg: 'bg-emerald-950/40', text: 'text-emerald-300', label: 'CANON' },
  SHAPE: { bg: 'bg-amber-950/40', text: 'text-amber-300', label: 'SHAPE' },
} as const;

function formatRelativeTime(iso: string): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}h ago`;
  return iso.slice(0, 10);
}

export type JournalEntryCardProps = {
  entry: JournalFeedCardEntry;
  expanded: boolean;
  onToggleExpand: () => void;
  onRelatedClick?: (journalEntryId: string) => void;
  registerAnchor?: (id: string, el: HTMLElement | null) => void;
};

export function JournalEntryCard({
  entry,
  expanded,
  onToggleExpand,
  onRelatedClick,
  registerAnchor,
}: JournalEntryCardProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const agentColor = JOURNAL_AGENT_COLORS[entry.agent] ?? '#94a3b8';
  const laneStyle = LANE_STYLES[entry.lane] ?? LANE_STYLES.SHAPE;
  const preview =
    expanded || !entry.summary
      ? entry.summary
      : entry.summary.length > 120
        ? `${entry.summary.slice(0, 120)}…`
        : entry.summary;

  useEffect(() => {
    registerAnchor?.(entry.id, rootRef.current);
    return () => {
      registerAnchor?.(entry.id, null);
    };
  }, [entry.id, registerAnchor]);

  function handleRootClick(e: React.MouseEvent) {
    const el = e.target as HTMLElement;
    if (el.closest('button') || el.closest('a')) return;
    onToggleExpand();
  }

  return (
    <article
      ref={(n) => {
        rootRef.current = n;
      }}
      data-journal-entry-id={entry.id}
      role="button"
      tabIndex={0}
      onClick={handleRootClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggleExpand();
        }
      }}
      className={`mb-2 cursor-pointer rounded-xl border bg-slate-900/60 p-3 transition-all dark:bg-slate-900/80 ${
        expanded
          ? 'border-l-[3px] border-slate-600 border-l-transparent'
          : 'border-slate-800 hover:border-slate-600 dark:border-slate-700'
      }`}
      style={expanded ? { borderLeftColor: agentColor } : undefined}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: agentColor }} />
        <span className="text-[11px] font-medium tracking-wide" style={{ color: agentColor }}>
          {entry.agent}
        </span>
        <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">{entry.cycle}</span>
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${laneStyle.bg} ${laneStyle.text}`}>{laneStyle.label}</span>
        <span className="ml-auto text-[10px] text-slate-500">{formatRelativeTime(entry.timestamp)}</span>
      </div>

      <h3 className="mb-1 text-[13px] font-medium leading-snug text-slate-100">
        {entry.title || entry.summary?.slice(0, 80) || 'Journal entry'}
      </h3>

      <p className="text-[12px] leading-relaxed text-slate-400">{preview}</p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-amber-950/50 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
          GI {entry.gi_at_time != null && Number.isFinite(entry.gi_at_time) ? entry.gi_at_time.toFixed(2) : '—'}
        </span>
        <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-500">
          {entry.event_type ?? 'observation'}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          className="ml-auto flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" /> collapse
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" /> expand
            </>
          )}
        </button>
      </div>

      {expanded ? (
        <div className="mt-3 border-t border-slate-800 pt-3 dark:border-slate-800">
          <div className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-500">
            {entry.summary}
            {'\n\n'}
            Entry: {entry.id}
            {'\n'}
            Agent: {entry.agent}
            {'\n'}
            Cycle: {entry.cycle} · Lane: {entry.lane}
            {'\n'}
            GI: {entry.gi_at_time != null && Number.isFinite(entry.gi_at_time) ? entry.gi_at_time.toFixed(3) : '—'}
            {entry.tags?.length ? `\nTags: ${entry.tags.join(', ')}` : ''}
          </div>
          <DerivedFromChain items={entry.raw.derivedFrom} onJournalRefClick={onRelatedClick} />
        </div>
      ) : null}
    </article>
  );
}
