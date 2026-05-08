'use client';

import { useState, useEffect, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

interface Heartbeats {
  journal:  string | null;
  runtime:  string | null;
  vault:    string | null;
  promote:  string | null;
  timestamp?: string;
}

interface EpiconItem {
  id?:          string | number;
  title?:       string;
  summary?:     string;
  agent?:       string;
  author?:      string;
  confidence?:  number;
  mii_score?:   number;
  tags?:        string[];
  timestamp?:   string;
  createdAt?:   string;
}

interface EpiconResponse {
  ok?:    boolean;
  items?: EpiconItem[];
  count?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ageLabel(iso: string | null): string {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return 'now';
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
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

export default function PulsePageClient() {
  const [heartbeats, setHeartbeats] = useState<Heartbeats | null>(null);
  const [epicon, setEpicon]         = useState<EpiconItem[]>([]);
  const [epiconCount, setEpiconCount] = useState<number>(0);
  const [loading, setLoading]       = useState(true);

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
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHeartbeats();
    void loadEpicon();
    const hbInterval  = setInterval(() => void loadHeartbeats(), 30_000);
    const epInterval  = setInterval(() => void loadEpicon(),     15_000);
    return () => { clearInterval(hbInterval); clearInterval(epInterval); };
  }, [loadHeartbeats, loadEpicon]);

  const hbRail: Array<{ label: string; ts: string | null }> = [
    { label: 'Journal', ts: heartbeats?.journal  ?? null },
    { label: 'Runtime', ts: heartbeats?.runtime  ?? null },
    { label: 'Vault',   ts: heartbeats?.vault    ?? null },
    { label: 'Promote', ts: heartbeats?.promote  ?? null },
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

      {/* ── EPICON feed (scrollable) ── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800/60 px-3 py-1.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">
            EPICON feed
          </span>
          <span className="font-mono text-[9px] text-slate-600">
            {epiconCount} events
            {loading && <span className="ml-1 animate-pulse text-slate-700">↻</span>}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {epicon.length === 0 && !loading && (
            <p className="px-3 py-4 font-mono text-[10px] text-slate-600">
              No EPICON events in current cycle
            </p>
          )}
          {epicon.map((ev, i) => {
            const conf    = (ev.confidence ?? ev.mii_score) as number | null ?? null;
            const confPct = conf != null ? Math.round(conf * 100) : null;
            const confColor =
              conf == null ? '' :
              conf >= 0.9  ? 'bg-emerald-900/40 text-emerald-400' :
              conf >= 0.7  ? 'bg-amber-900/40 text-amber-400' :
              'bg-slate-800 text-slate-500';
            const tags = Array.isArray(ev.tags) ? ev.tags : [];

            return (
              <div
                key={String(ev.id ?? i)}
                className="flex items-start gap-2 border-b border-slate-800/40 px-3 py-2 hover:bg-slate-900/30"
              >
                {/* Confidence badge */}
                {confPct != null && (
                  <span className={`mt-0.5 shrink-0 rounded px-1 font-mono text-[8px] uppercase ${confColor}`}>
                    {confPct}%
                  </span>
                )}

                {/* Title + tags */}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[10px] text-slate-200">
                    {String(ev.title ?? ev.summary ?? ev.id ?? '—')}
                  </p>
                  {tags.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {tags.slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-slate-800 px-1 font-mono text-[7px] uppercase text-slate-500"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Agent + time */}
                <div className="shrink-0 text-right">
                  <p className="font-mono text-[9px] text-slate-500">
                    {String(ev.agent ?? ev.author ?? '—')}
                  </p>
                  <p className="font-mono text-[8px] text-slate-700">
                    {ageLabel(ev.timestamp ?? ev.createdAt ?? null)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
