'use client';

import { Search } from 'lucide-react';

export type SortMode = 'newest' | 'oldest' | 'agent' | 'cycle' | 'operator';
export type ViewMode = 'feed' | 'by-cycle' | 'by-agent';

const AGENTS = ['ATLAS', 'ZEUS', 'EVE', 'JADE', 'AUREA', 'HERMES', 'ECHO', 'DAEDALUS'] as const;

export const JOURNAL_AGENT_COLORS: Record<string, string> = {
  ATLAS: '#60a5fa',
  ZEUS: '#fbbf24',
  EVE: '#34d399',
  JADE: '#a78bfa',
  AUREA: '#f59e0b',
  HERMES: '#f87171',
  ECHO: '#22d3ee',
  DAEDALUS: '#94a3b8',
};

export type JournalToolbarProps = {
  sortValue: SortMode;
  onSortChange: (v: SortMode) => void;
  viewValue: ViewMode;
  onViewChange: (v: ViewMode) => void;
  searchValue: string;
  onSearchChange: (v: string) => void;
  activeAgents: Set<string>;
  onAgentToggle: (agent: string) => void;
};

export function JournalToolbar({
  sortValue,
  onSortChange,
  viewValue,
  onViewChange,
  searchValue,
  onSearchChange,
  activeAgents,
  onAgentToggle,
}: JournalToolbarProps) {
  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-36 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search entries…"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 py-1.5 pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-slate-500 dark:border-slate-600 dark:bg-slate-900"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-slate-500">Sort</label>
          <select
            value={sortValue}
            onChange={(e) => onSortChange(e.target.value as SortMode)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="agent">By agent</option>
            <option value="cycle">By cycle</option>
            <option value="operator">Operator priority</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-slate-500">View</label>
          <select
            value={viewValue}
            onChange={(e) => onViewChange(e.target.value as ViewMode)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 dark:border-slate-600 dark:bg-slate-900"
          >
            <option value="feed">Feed</option>
            <option value="by-cycle">By cycle</option>
            <option value="by-agent">By agent</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onAgentToggle('ALL')}
          className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
            activeAgents.size === 0
              ? 'border-slate-100 bg-slate-100 text-slate-900 dark:border-white dark:bg-white dark:text-slate-900'
              : 'border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'
          }`}
        >
          All agents
        </button>
        {AGENTS.map((agent) => {
          const active = activeAgents.has(agent);
          const color = JOURNAL_AGENT_COLORS[agent] ?? '#888';
          return (
            <button
              key={agent}
              type="button"
              onClick={() => onAgentToggle(agent)}
              className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-all"
              style={
                active
                  ? {
                      borderColor: color,
                      color,
                      background: `${color}18`,
                      borderWidth: '1.5px',
                      fontWeight: 500,
                    }
                  : { borderColor: 'rgba(51,65,85,0.9)', color: '#94a3b8' }
              }
            >
              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
              {agent}
            </button>
          );
        })}
      </div>
    </div>
  );
}
