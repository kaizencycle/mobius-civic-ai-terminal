'use client';

import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

export interface EpiconFeedItem {
  id: string;
  timestamp: string;
  author: string;
  title: string;
  type: 'merge' | 'heartbeat' | 'catalog' | 'epicon' | 'zeus-verify' | string;
  severity: string;
  tags: string[];
  source: string;
  verified: boolean;
  sha?: string;
  gi?: number;
}

interface EventScreenerProps {
  items: EpiconFeedItem[] | null | undefined;
  summary: { latestGI?: number; degradedCount?: number; lastHeartbeat?: string };
  sources: { github: number; kv: number };
  total: number;
  searchQuery?: string;
  sortBy?: 'time-desc' | 'time-asc' | 'type' | 'author' | 'gi-desc' | 'severity';
  onResultCountChange?: (count: number) => void;
}

const PAGE_SIZE = 12;

type SortColumn = 'time' | 'type' | 'author' | 'gi';
type TypeFilter = 'all' | 'merge' | 'heartbeat' | 'catalog' | 'epicon' | 'zeus-verify';
type AuthorFilter = 'all' | 'kaizencycle' | 'mobius-bot' | 'cursor-agent';

const TYPE_LABELS: Record<TypeFilter, string> = {
  all: 'All',
  merge: 'Merge',
  heartbeat: 'Heartbeat',
  catalog: 'Catalog',
  epicon: 'EPICON',
  'zeus-verify': 'ZEUS',
};

const TYPE_STYLES: Record<string, string> = {
  merge: 'bg-blue-950 text-blue-300 border-blue-800',
  heartbeat: 'bg-purple-950 text-purple-300 border-purple-800',
  catalog: 'bg-emerald-950 text-emerald-300 border-emerald-800',
  epicon: 'bg-amber-950 text-amber-300 border-amber-800',
  'zeus-verify': 'bg-red-950 text-red-300 border-red-800',
};

const AUTHOR_STYLES: Record<string, string> = {
  kaizencycle: 'text-blue-400',
  'mobius-bot': 'text-purple-400',
  'cursor-agent': 'text-emerald-400',
};

const TYPE_DOT_STYLES: Record<string, string> = {
  merge: 'bg-blue-500',
  heartbeat: 'bg-purple-400',
  catalog: 'bg-emerald-400',
  epicon: 'bg-amber-400',
  'zeus-verify': 'bg-red-400',
};

const AGENT_BADGE_STYLES: Record<string, string> = {
  kaizencycle: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
  'mobius-bot': 'border-purple-500/30 bg-purple-500/10 text-purple-300',
  'cursor-agent': 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
};

const SEVERITY_STYLES: Record<string, string> = {
  low: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300',
  medium: 'border-amber-500/35 bg-amber-500/10 text-amber-300',
  high: 'border-orange-500/35 bg-orange-500/10 text-orange-300',
  critical: 'border-red-500/35 bg-red-500/10 text-red-300',
};

function initialsForAgent(author: string): string {
  const parts = author.trim().split(/[\s_-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${(parts[0]![0] ?? '?').toUpperCase()}${(parts[1]![0] ?? '?').toUpperCase()}`;
}

function formatTimestampIso(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toISOString();
}

function severityStyle(severity: string): string {
  const key = severity.toLowerCase();
  return SEVERITY_STYLES[key] ?? 'border-slate-700 bg-slate-800/50 text-slate-300';
}

function giFillTone(gi: number): string {
  if (gi >= 0.85) return 'bg-emerald-500';
  if (gi >= 0.72) return 'bg-amber-400';
  if (gi >= 0.55) return 'bg-orange-500';
  return 'bg-rose-500';
}

function timeAgo(timestamp: string): string {
  const time = new Date(timestamp).getTime();
  if (Number.isNaN(time)) return '—';
  const diffSeconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function giTone(gi: number | undefined) {
  if (typeof gi !== 'number') {
    return {
      shell: 'bg-slate-800/40 text-slate-400 border border-slate-700',
      label: 'unknown',
    };
  }

  if (gi > 0.85) {
    return { shell: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30', label: 'nominal' };
  }
  if (gi > 0.7) {
    return { shell: 'bg-amber-500/10 text-amber-400 border border-amber-500/30', label: 'stressed' };
  }
  return { shell: 'bg-red-500/10 text-red-400 border border-red-500/30', label: 'critical' };
}

function sourceLabel(source: string): string {
  if (source === 'github-commit') return 'github';
  if (source === 'eve-synthesis') return 'eve-syn';
  if (source === 'kv-ledger' || source === 'kv') return 'kv';
  return source.length > 10 ? source.slice(0, 10) : source;
}

function initialsForAgent(author: string): string {
  if (!author) return '??';
  const normalized = author.replace(/[_-]+/g, ' ').trim();
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '??';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
}

function formatTimestampIso(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toISOString();
}

function severityStyle(severity: string): string {
  return SEVERITY_STYLES[severity?.toLowerCase()] ?? 'border-slate-700 bg-slate-900 text-slate-300';
}

function giFillTone(gi: number): string {
  if (gi >= 0.85) return 'bg-emerald-400';
  if (gi >= 0.7) return 'bg-amber-400';
  return 'bg-red-400';
}

export default function EventScreener({
  items,
  summary,
  sources,
  total,
  searchQuery: externalSearchQuery,
  sortBy,
  onResultCountChange,
}: EventScreenerProps) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [authorFilter, setAuthorFilter] = useState<AuthorFilter>('all');
  const [sortCol, setSortCol] = useState<SortColumn>('time');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [localSearchQuery, setLocalSearchQuery] = useState('');

  const searchQuery = externalSearchQuery ?? localSearchQuery;

  const list = items ?? [];

  const filteredAndSorted = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    const severityRank: Record<string, number> = { critical: 0, elevated: 1, nominal: 2 };

    const externallyFiltered = list.filter((item) => {
      if (!needle) return true;
      return (
        item.title?.toLowerCase().includes(needle) ||
        item.author?.toLowerCase().includes(needle) ||
        item.type?.toLowerCase().includes(needle) ||
        (item.tags ?? []).some((tag) => tag.toLowerCase().includes(needle))
      );
    });

    const externallySorted = [...externallyFiltered].sort((a, b) => {
      if (sortBy === 'time-asc') return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      if (sortBy === 'type') return (a.type ?? '').localeCompare(b.type ?? '');
      if (sortBy === 'author') return (a.author ?? '').localeCompare(b.author ?? '');
      if (sortBy === 'gi-desc') return (b.gi ?? -1) - (a.gi ?? -1);
      if (sortBy === 'severity') return (severityRank[a.severity?.toLowerCase()] ?? Number.MAX_SAFE_INTEGER) - (severityRank[b.severity?.toLowerCase()] ?? Number.MAX_SAFE_INTEGER);
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    const filtered = externallySorted.filter((item) => {
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      if (authorFilter !== 'all' && item.author !== authorFilter) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortCol === 'time') {
        return sortDir * (new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      }
      if (sortCol === 'type') {
        return sortDir * a.type.localeCompare(b.type);
      }
      if (sortCol === 'author') {
        return sortDir * a.author.localeCompare(b.author);
      }
      return sortDir * ((a.gi ?? -1) - (b.gi ?? -1));
    });
  }, [authorFilter, list, searchQuery, sortBy, sortCol, sortDir, typeFilter]);

  useEffect(() => {
    onResultCountChange?.(filteredAndSorted.length);
  }, [filteredAndSorted.length, onResultCountChange]);

  const pageCount = Math.max(1, Math.ceil(filteredAndSorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pagedRows = filteredAndSorted.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  const gi = summary.latestGI;
  const giBadgeTone = giTone(gi);

  const merges = list.filter((item) => item.type === 'merge').length;
  const heartbeats = list.filter((item) => item.type === 'heartbeat').length;

  const handleSort = (col: SortColumn) => {
    if (sortCol === col) {
      setSortDir((prev) => (prev === 1 ? -1 : 1));
      return;
    }
    setSortCol(col);
    setSortDir(col === 'time' ? -1 : 1);
  };

  const sortIndicator = (col: SortColumn) => {
    if (sortCol !== col) return '↕';
    return sortDir === 1 ? '↑' : '↓';
  };

  if (items == null) {
    return (
      <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
        <div className="h-5 w-32 animate-pulse rounded bg-slate-800" />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-md border border-slate-800 bg-slate-900/50" />
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-md border border-slate-800 bg-slate-900/30" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-mono uppercase tracking-widest text-slate-400">Event Screener</div>
        <div className="flex items-center gap-2">
          <span className={cn('rounded-full px-2 py-1 text-[10px] font-mono', giBadgeTone.shell)}>
            GI {typeof gi === 'number' ? gi.toFixed(2) : '—'} · {giBadgeTone.label}
          </span>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatCard label="Total Events" value={String(total || list.length)} />
        <StatCard label="Merges" value={String(merges)} />
        <StatCard label="Heartbeats" value={String(heartbeats)} />
        <StatCard label="KV Source" value={`${sources.kv} vs ${sources.github}`} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(TYPE_LABELS) as TypeFilter[]).map((type) => {
          const active = typeFilter === type;
          return (
            <button
              key={type}
              onClick={() => {
                setTypeFilter(type);
                setPage(0);
              }}
              className={cn(
                'rounded-full border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em]',
                active
                  ? 'border-sky-500/30 bg-sky-500/10 text-sky-400'
                  : 'border-slate-700 bg-transparent text-slate-500',
              )}
            >
              {TYPE_LABELS[type]}
            </button>
          );
        })}

        <input
          value={searchQuery}
          onChange={(event) => {
            setLocalSearchQuery(event.target.value);
            setPage(0);
          }}
          placeholder="Search title, author, type..."
          className="min-w-48 flex-1 rounded border border-slate-800 bg-slate-900 px-2 py-1 text-[10px] font-mono text-slate-200 placeholder:text-slate-600"
        />

        <select
          value={authorFilter}
          onChange={(event) => {
            setAuthorFilter(event.target.value as AuthorFilter);
            setPage(0);
          }}
          className="rounded border border-slate-800 bg-slate-900 px-2 py-1 text-[10px] font-mono text-slate-300"
        >
          <option value="all">all authors</option>
          <option value="kaizencycle">kaizencycle</option>
          <option value="mobius-bot">mobius-bot</option>
          <option value="cursor-agent">cursor-agent</option>
        </select>
      </div>

      <div className="rounded-md border border-slate-800">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-950/70 px-2 py-2 text-[10px] font-mono text-slate-500">
          <span className="uppercase">Sort:</span>
          <SortButton label="Time" onClick={() => handleSort('time')} indicator={sortIndicator('time')} active={sortCol === 'time'} />
          <SortButton label="Type" onClick={() => handleSort('type')} indicator={sortIndicator('type')} active={sortCol === 'type'} />
          <SortButton label="Author" onClick={() => handleSort('author')} indicator={sortIndicator('author')} active={sortCol === 'author'} />
          <SortButton label="GI" onClick={() => handleSort('gi')} indicator={sortIndicator('gi')} active={sortCol === 'gi'} />
        </div>
        <div className="divide-y divide-slate-800">
          {pagedRows.map((item) => {
            const isOpen = openId === item.id;
            const isEve = item.source === 'eve-synthesis';
            const dotClass = TYPE_DOT_STYLES[item.type] ?? 'bg-slate-500';
            return (
              <div key={item.id} className={cn('transition hover:bg-slate-900/40', isOpen && 'bg-sky-500/5')}>
                <button
                  type="button"
                  onClick={() => setOpenId((prev) => (prev === item.id ? null : item.id))}
                  className="flex w-full items-center gap-2 px-2 py-2 text-left text-[10px] font-mono"
                >
                  <span className={cn('text-slate-500 transition-transform', isOpen ? 'rotate-90' : 'rotate-0')}>▶</span>
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotClass)} />
                  <span className="min-w-0 flex-1 truncate text-[11px] text-slate-200">{item.title}</span>
                  {isEve ? (
                    <span className="rounded border border-rose-500/35 bg-rose-500/10 px-1 py-0.5 text-[9px] uppercase text-rose-300">EVE SYN</span>
                  ) : null}
                  <span className="text-slate-500">{timeAgo(item.timestamp)}</span>
                  <span className={cn('rounded border px-1.5 py-0.5 uppercase', TYPE_STYLES[item.type] ?? 'border-slate-700 text-slate-300')}>
                    {item.type}
                  </span>
                </button>

                {isOpen ? (
                    <div className="overflow-hidden">
                      <div className="border-t border-slate-800 px-2 py-2">
                        <div className="grid gap-2 text-xs md:grid-cols-2">
                          <AccordionField
                            label="Agent"
                            value={(
                              <div className="flex items-center gap-1.5">
                                <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-mono uppercase', AGENT_BADGE_STYLES[item.author] ?? 'border-slate-700 bg-slate-800 text-slate-300')}>
                                  {initialsForAgent(item.author)}
                                </span>
                                <span className={cn(AUTHOR_STYLES[item.author] ?? 'text-slate-300')}>{item.author}</span>
                              </div>
                            )}
                          />
                          <AccordionField label="Timestamp" value={<span className="font-mono text-[10px] text-slate-300">{formatTimestampIso(item.timestamp)}</span>} />
                          <AccordionField label="Type" value={<span className={cn('rounded border px-1.5 py-0.5 uppercase', TYPE_STYLES[item.type] ?? 'border-slate-700 text-slate-300')}>{item.type}</span>} />
                          <AccordionField label="Severity" value={<span className={cn('rounded border px-1.5 py-0.5 uppercase', severityStyle(item.severity))}>{item.severity}</span>} />
                          <AccordionField
                            label="Verified"
                            value={(
                              <span className={item.verified ? 'text-emerald-300' : 'text-slate-400'}>
                                {item.verified ? '✓ verified' : '○ pending'}
                              </span>
                            )}
                          />
                          <AccordionField
                            label="Source"
                            value={(
                              <span className={cn('rounded border px-1.5 py-0.5 text-[10px] uppercase', isEve ? 'border-rose-500/35 bg-rose-500/10 text-rose-300' : 'border-slate-700 text-slate-300')}>
                                {sourceLabel(item.source)}
                              </span>
                            )}
                          />
                          <AccordionField label="Commit SHA" value={<span className="font-mono text-[10px] text-slate-300">{item.sha ? item.sha.slice(0, 12) : '—'}</span>} />
                          <AccordionField label="Event ID" value={<span className="font-mono text-[10px] text-slate-500">{item.id}</span>} />
                          {typeof item.gi === 'number' ? (
                            <AccordionField
                              label="Global Integrity"
                              value={(
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 w-24 overflow-hidden rounded bg-slate-800">
                                    <div
                                      className={cn('h-full rounded', giFillTone(item.gi))}
                                      style={{ width: `${Math.max(0, Math.min(1, item.gi)) * 100}%` }}
                                    />
                                  </div>
                                  <span className="font-mono text-[10px] text-slate-300">{item.gi.toFixed(3)}</span>
                                </div>
                              )}
                            />
                          ) : null}
                          <div className="md:col-span-2">
                            <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-slate-500">Tags</div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {(item.tags ?? []).length > 0 ? (
                                item.tags.map((tag) => (
                                  <span key={tag} className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[10px] font-mono text-slate-300">
                                    {tag}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[10px] text-slate-500">—</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 border-t border-slate-800 pt-2">
                          <ActionGhostButton label="Analyze" />
                          <ActionGhostButton label="GI impact" />
                          {item.type === 'heartbeat' ? <ActionGhostButton label="Explain heartbeat" /> : null}
                          {item.type === 'merge' ? <ActionGhostButton label="Explain commit" /> : null}
                          {item.type === 'epicon' ? <ActionGhostButton label="ZEUS verify" /> : null}
                        </div>
                      </div>
                    </div>
                  ) : null}
              </div>
            );
          })}
        </div>
        {pagedRows.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-500">No events match the current filters.</div>
        ) : null}
      </div>

      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((prev) => Math.max(0, prev - 1))}
            disabled={currentPage === 0}
            className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40"
          >
            Prev
          </button>
          <button
            onClick={() => setPage((prev) => Math.min(pageCount - 1, prev + 1))}
            disabled={currentPage >= pageCount - 1}
            className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40"
          >
            Next
          </button>
          <span>page {currentPage + 1} of {pageCount}</span>
        </div>
        <span>{filteredAndSorted.length} events</span>
      </div>

    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/50 p-2">
      <div className="text-[9px] font-mono uppercase tracking-widest text-slate-500">{label}</div>
      <div className="text-lg font-mono font-bold text-slate-100">{value}</div>
    </div>
  );
}

function SortButton({ label, onClick, indicator, active }: { label: string; onClick: () => void; indicator: string; active: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded border px-2 py-1 uppercase transition hover:text-slate-300',
        active ? 'border-sky-500/30 bg-sky-500/10 text-sky-300' : 'border-slate-700 text-slate-500',
      )}
    >
      {label}
      <span>{indicator}</span>
    </button>
  );
}

function AccordionField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className="mt-1 text-slate-200">{value}</div>
    </div>
  );
}

function ActionGhostButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="rounded border border-slate-700 px-2 py-1 text-[10px] font-mono text-slate-300 hover:border-sky-500/40 hover:text-sky-300"
    >
      {label}
    </button>
  );
}
