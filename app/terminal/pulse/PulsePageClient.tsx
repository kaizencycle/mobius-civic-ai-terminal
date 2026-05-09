'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

interface Heartbeats {
  journal:  string | null;
  runtime:  string | null;
  vault:    string | null;
  promote:  string | null;
}

interface EpiconItem {
  id?:         string | number;
  title?:      string;
  summary?:    string;
  agent?:      string;
  author?:     string;
  confidence?: number;
  mii_score?:  number;
  tags?:       string[];
  timestamp?:  string;
  createdAt?:  string;
}

interface EpiconResponse {
  items?: EpiconItem[];
  count?: number;
}

interface SearchResult {
  source:      'journal' | 'vault' | 'ledger' | 'epicon-cache';
  event_id?:   string;
  title?:      string;
  summary?:    string;
  message?:    string;
  agent?:      string;
  cycle?:      string;
  confidence?: number;
  severity?:   string;
  tags?:       string[];
  attested_at?: number;
  writtenAt?:  string;
  timestamp?:  string;
  status?:     string;
  sealId?:     string;
  seal_id?:    string;
  [key: string]: unknown;
}

interface SearchState {
  query:     string;
  loading:   boolean;
  results:   SearchResult[];
  count:     number;
  queryType: string;
  error:     string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ageLabel(ts: string | number | null | undefined): string {
  if (ts == null) return '—';
  const ms = typeof ts === 'number' ? ts : new Date(ts).getTime();
  if (isNaN(ms)) return '—';
  const diffMs = Date.now() - ms;
  if (diffMs < 0) return 'now';
  const s = Math.floor(diffMs / 1000);
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function heartbeatDot(iso: string | null): string {
  if (!iso) return 'bg-slate-700';
  const ageMin = (Date.now() - new Date(iso).getTime()) / 60_000;
  if (ageMin < 6)  return 'bg-emerald-400';
  if (ageMin < 15) return 'bg-amber-400';
  return 'bg-red-500';
}

// ── Component ────────────────────────────────────────────────────────────────

const EMPTY_SEARCH: SearchState = {
  query: '', loading: false, results: [], count: 0, queryType: '', error: null,
};

export default function PulsePageClient() {
  const [heartbeats, setHeartbeats] = useState<Heartbeats | null>(null);
  const [epicon,     setEpicon]     = useState<EpiconItem[]>([]);
  const [epiconCount, setEpiconCount] = useState<number>(0);
  const [feedLoading, setFeedLoading] = useState(true);
  const [search,     setSearch]     = useState<SearchState>(EMPTY_SEARCH);
  const [inputVal,   setInputVal]   = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Data fetchers ─────────────────────────────────────────────────────────

  const loadHeartbeats = useCallback(async () => {
    try {
      const res = await fetch('/api/health/heartbeats');
      if (res.ok) setHeartbeats(await res.json() as Heartbeats);
    } catch (e) {
      console.warn('[pulse] heartbeats fetch failed:', e);
    }
  }, []);

  const loadEpicon = useCallback(async () => {
    try {
      const res = await fetch('/api/epicon/feed?limit=50');
      if (!res.ok) return;
      const data = await res.json() as EpiconResponse;
      setEpicon(data.items ?? []);
      setEpiconCount(data.count ?? data.items?.length ?? 0);
    } catch (e) {
      console.warn('[pulse] epicon fetch failed:', e);
    } finally {
      setFeedLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHeartbeats();
    void loadEpicon();
    const hbInterval = setInterval(() => void loadHeartbeats(), 30_000);
    const epInterval = setInterval(() => void loadEpicon(),     15_000);
    return () => { clearInterval(hbInterval); clearInterval(epInterval); };
  }, [loadHeartbeats, loadEpicon]);

  // ── Search ────────────────────────────────────────────────────────────────

  async function runSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed) { clearSearch(); return; }
    setSearch(s => ({ ...s, query: trimmed, loading: true, error: null }));
    try {
      const res  = await fetch(`/api/pulse/search?q=${encodeURIComponent(trimmed)}`);
      const data = await res.json() as { ok?: boolean; error?: string; results?: SearchResult[]; count?: number; queryType?: string };
      if (!res.ok) throw new Error(data.error ?? 'Search failed');
      setSearch({
        query:     trimmed,
        loading:   false,
        results:   data.results   ?? [],
        count:     data.count     ?? 0,
        queryType: data.queryType ?? '',
        error:     null,
      });
    } catch (err) {
      setSearch(s => ({ ...s, loading: false, error: String(err) }));
    }
  }

  function clearSearch() {
    setSearch(EMPTY_SEARCH);
    setInputVal('');
    inputRef.current?.focus();
  }

  const inSearchMode = search.query.length > 0;

  // ── Heartbeat rail data ───────────────────────────────────────────────────

  const hbRail: Array<{ label: string; ts: string | null }> = [
    { label: 'Journal', ts: heartbeats?.journal ?? null },
    { label: 'Runtime', ts: heartbeats?.runtime ?? null },
    { label: 'Vault',   ts: heartbeats?.vault   ?? null },
    { label: 'Promote', ts: heartbeats?.promote ?? null },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* ── Heartbeat rail (sticky) ── */}
      <div className="shrink-0 border-b border-slate-800 bg-slate-950/80 px-3 py-2">
        <div className="mb-1 font-mono text-[8px] uppercase tracking-[0.2em] text-slate-600">
          Cron heartbeats
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {hbRail.map(({ label, ts }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${heartbeatDot(ts)}`} />
              <span className="font-mono text-[9px] uppercase tracking-wide text-slate-400">
                {label}
              </span>
              <span className="font-mono text-[9px] text-slate-600">
                {ageLabel(ts)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Search bar ── */}
      <div className="shrink-0 border-b border-slate-800/60 bg-slate-950/90 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="shrink-0 font-mono text-[10px] text-slate-600">⌕</span>
          <input
            ref={inputRef}
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') void runSearch(inputVal);
              if (e.key === 'Escape') clearSearch();
            }}
            placeholder="C-298  ·  ATLAS  ·  seal-C-298-001  ·  any tag or event ID"
            className="flex-1 bg-transparent font-mono text-[11px] text-sky-300 outline-none placeholder:text-slate-700"
          />
          {inputVal && !inSearchMode && (
            <button
              onClick={() => void runSearch(inputVal)}
              className="shrink-0 rounded border border-slate-700 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-slate-400 hover:border-slate-500 hover:text-slate-200"
            >
              Search
            </button>
          )}
          {inSearchMode && (
            <button
              onClick={clearSearch}
              className="shrink-0 rounded border border-slate-700 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-slate-400 hover:border-red-700 hover:text-red-300"
            >
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Feed area ── */}
      <div className="min-h-0 flex-1 overflow-y-auto">

        {/* ── Search results mode ── */}
        {inSearchMode && (
          <>
            <div className="sticky top-0 z-10 border-b border-slate-800/60 bg-slate-950/95 px-3 py-1.5 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
                  {search.loading
                    ? 'Searching…'
                    : `${search.count} results · ${search.query}`}
                </span>
                <span className="font-mono text-[9px] capitalize text-slate-600">
                  {search.queryType}
                </span>
              </div>
            </div>

            {search.error && (
              <p className="px-3 py-3 font-mono text-[10px] text-red-400">{search.error}</p>
            )}

            {!search.loading && search.results.length === 0 && !search.error && (
              <p className="px-3 py-4 font-mono text-[10px] text-slate-600">
                No records found for{' '}
                <span className="text-slate-400">{search.query}</span>
              </p>
            )}

            <div className="divide-y divide-slate-800/40 pb-28 md:pb-8">
              {search.results.map((r, i) => {
                const sourceColor =
                  r.source === 'ledger'       ? 'text-cyan-500'   :
                  r.source === 'journal'      ? 'text-violet-400' :
                  r.source === 'vault'        ? 'text-amber-400'  :
                  'text-slate-500';
                const conf = typeof r.confidence === 'number' ? r.confidence : null;
                const ts   = r.attested_at ?? r.writtenAt ?? r.timestamp ?? null;
                const tags = Array.isArray(r.tags) ? (r.tags as string[]) : [];
                return (
                  <div
                    key={String(r.event_id ?? r.seal_id ?? r.sealId ?? i)}
                    className="grid grid-cols-[auto_1fr_auto] items-start gap-x-2 px-3 py-2 hover:bg-white/[0.02]"
                  >
                    <span className={`mt-0.5 shrink-0 font-mono text-[8px] uppercase ${sourceColor}`}>
                      {r.source === 'epicon-cache' ? 'epicon' : r.source}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[11px] text-slate-200">
                        {String(r.title ?? r.summary ?? r.message ?? r.event_id ?? r.seal_id ?? r.sealId ?? '—')}
                      </p>
                      <p className="mt-0.5 font-mono text-[9px] text-slate-600">
                        {[r.cycle, r.agent, r.status].filter(Boolean).join(' · ')}
                        {tags.length > 0 && ` · ${tags.join(' ')}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {conf != null && (
                        <p className={`font-mono text-[9px] ${
                          conf >= 0.9 ? 'text-emerald-400' :
                          conf >= 0.7 ? 'text-amber-400'   :
                          'text-slate-500'
                        }`}>
                          {(conf * 100).toFixed(0)}%
                        </p>
                      )}
                      <p className="font-mono text-[9px] text-slate-700">{ageLabel(ts)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── Live EPICON feed — shown when not in search mode ── */}
        {!inSearchMode && (
          <>
            <div className="sticky top-0 z-10 border-b border-slate-800/60 bg-slate-950/95 px-3 py-1.5 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">
                  EPICON feed
                </span>
                <span className="font-mono text-[9px] text-slate-600">
                  {feedLoading ? 'syncing…' : `${epiconCount} events`}
                </span>
              </div>
            </div>

            {epicon.length === 0 && !feedLoading && (
              <p className="px-3 py-4 font-mono text-[10px] text-slate-600">
                No EPICON events in current cycle
              </p>
            )}

            <div className="divide-y divide-slate-800/40 pb-28 md:pb-8">
              {epicon.map((ev, i) => {
                const conf    = (ev.confidence ?? ev.mii_score) ?? null;
                const confPct = conf != null ? Math.round(conf * 100) : null;
                const confColor =
                  conf == null ? '' :
                  conf >= 0.9  ? 'bg-emerald-900/40 text-emerald-400' :
                  conf >= 0.7  ? 'bg-amber-900/40 text-amber-400'     :
                  'bg-slate-800 text-slate-500';
                const tags = Array.isArray(ev.tags) ? ev.tags : [];

                return (
                  <div
                    key={String(ev.id ?? i)}
                    className="flex items-start gap-2 px-3 py-2 hover:bg-slate-900/30"
                  >
                    {confPct != null && (
                      <span className={`mt-0.5 shrink-0 rounded px-1 font-mono text-[8px] uppercase ${confColor}`}>
                        {confPct}%
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[10px] text-slate-200">
                        {String(ev.title ?? ev.summary ?? ev.id ?? '—')}
                      </p>
                      {tags.length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {tags.slice(0, 4).map(tag => (
                            <span key={tag} className="rounded bg-slate-800 px-1 font-mono text-[7px] uppercase text-slate-500">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-[9px] text-slate-500">
                        {String(ev.agent ?? ev.author ?? '—')}
                      </p>
                      <p className="font-mono text-[8px] text-slate-700">
                        {ageLabel(ev.timestamp ?? ev.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
