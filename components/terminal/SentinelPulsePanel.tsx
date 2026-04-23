'use client';

import { useEffect, useMemo, useState } from 'react';

type AtlasHeartbeat = {
  timestamp?: string;
  health?: string;
  signals?: {
    gi?: number;
    anomalies?: number;
    mode?: string;
  };
  eve?: {
    global_tension?: string;
  };
};

type ZeusVerification = {
  timestamp?: string;
  verification_status?: string;
  findings?: Array<{ result?: string }>;
  gi_verified?: boolean;
};

type AureaReportResponse = {
  ok?: boolean;
  report?: {
    timestamp?: string;
    summary?: string;
    pending_epicon_backlog?: {
      count?: number;
      status?: string;
    };
    adapter_health?: {
      degraded?: number;
      total?: number;
    };
  };
};

type PulseEvent = {
  id: string;
  agent: 'ATLAS' | 'ZEUS' | 'AUREA';
  timestamp: string;
  title: string;
  detail: string;
};

const HEARTBEAT_INDEX_URL =
  'https://api.github.com/repos/kaizencycle/mobius-civic-ai-terminal/contents/docs/catalog/heartbeats';
const ZEUS_FILE_URL =
  'https://raw.githubusercontent.com/kaizencycle/mobius-civic-ai-terminal/main/docs/catalog/zeus/20260324T211630Z-verification.json';
const REFRESH_MS = 2 * 60 * 1000;

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function badgeClass(agent: PulseEvent['agent']): string {
  if (agent === 'ATLAS') return 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200';
  if (agent === 'ZEUS') return 'border-amber-500/50 bg-amber-500/15 text-amber-200';
  return 'border-orange-500/50 bg-orange-500/15 text-orange-200';
}

export default function SentinelPulsePanel() {
  const [events, setEvents] = useState<PulseEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setError(null);

        const heartbeatListRes = await fetch(HEARTBEAT_INDEX_URL, { cache: 'no-store' });
        if (!heartbeatListRes.ok) throw new Error(`Heartbeat index failed (${heartbeatListRes.status})`);
        const heartbeatList = (await heartbeatListRes.json()) as Array<{ name?: string; download_url?: string }>;

        const latestHeartbeat = heartbeatList
          .filter((item) => item.name?.endsWith('.json') && item.download_url)
          .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
          .at(-1);

        if (!latestHeartbeat?.download_url) throw new Error('No ATLAS heartbeat found');

        const [atlasRes, zeusRes, aureaRes] = await Promise.all([
          fetch(latestHeartbeat.download_url, { cache: 'no-store' }),
          fetch(ZEUS_FILE_URL, { cache: 'no-store' }),
          fetch('/api/aurea/oversee', { cache: 'no-store' }),
        ]);

        if (!atlasRes.ok) throw new Error(`ATLAS heartbeat fetch failed (${atlasRes.status})`);
        if (!zeusRes.ok) throw new Error(`ZEUS report fetch failed (${zeusRes.status})`);
        if (!aureaRes.ok) throw new Error(`AUREA report fetch failed (${aureaRes.status})`);

        const [atlas, zeus, aurea] = await Promise.all([
          atlasRes.json() as Promise<AtlasHeartbeat>,
          zeusRes.json() as Promise<ZeusVerification>,
          aureaRes.json() as Promise<AureaReportResponse>,
        ]);

        const nextEvents: PulseEvent[] = [
          {
            id: 'atlas',
            agent: 'ATLAS' as const,
            timestamp: atlas.timestamp ?? new Date().toISOString(),
            title: `Heartbeat ${String(atlas.health ?? 'unknown').toUpperCase()}`,
            detail: `GI ${(atlas.signals?.gi ?? 0).toFixed(2)} · anomalies ${atlas.signals?.anomalies ?? 0} · EVE ${String(atlas.eve?.global_tension ?? 'n/a').toUpperCase()}`,
          },
          {
            id: 'zeus',
            agent: 'ZEUS' as const,
            timestamp: zeus.timestamp ?? new Date().toISOString(),
            title: `Verification ${String(zeus.verification_status ?? 'unknown').toUpperCase()}`,
            detail: `${zeus.findings?.length ?? 0} checks · GI ${zeus.gi_verified ? 'verified' : 'unverified'}`,
          },
          {
            id: 'aurea',
            agent: 'AUREA' as const,
            timestamp: aurea.report?.timestamp ?? new Date().toISOString(),
            title: `Oversight ${String(aurea.report?.pending_epicon_backlog?.status ?? 'nominal').toUpperCase()}`,
            detail: `Pending ${aurea.report?.pending_epicon_backlog?.count ?? 0} · degraded adapters ${aurea.report?.adapter_health?.degraded ?? 0}/${aurea.report?.adapter_health?.total ?? 0}`,
          },
        ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        if (!cancelled) {
          setEvents(nextEvents);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Unable to load sentinel timeline');
          setLoading(false);
        }
      }
    };

    void load();
    const interval = setInterval(() => {
      void load();
    }, REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const content = useMemo(() => {
    if (loading) return <div className="text-sm text-slate-400">Loading sentinel timeline…</div>;
    if (error) return <div className="text-sm text-rose-300">{error}</div>;
    if (events.length === 0) return <div className="text-sm text-slate-400">No sentinel events found.</div>;

    return (
      <ul className="space-y-3">
        {events.map((event) => (
          <li key={event.id} className="cv-auto rounded-lg border border-slate-800 bg-slate-950/70 p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className={`rounded-md border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.14em] ${badgeClass(event.agent)}`}>
                {event.agent}
              </span>
              <span className="text-xs text-slate-500">{formatTimestamp(event.timestamp)}</span>
            </div>
            <div className="text-sm font-semibold text-slate-100">{event.title}</div>
            <div className="mt-1 text-xs text-slate-400">{event.detail}</div>
          </li>
        ))}
      </ul>
    );
  }, [error, events, loading]);

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 text-xs uppercase tracking-[0.18em] text-slate-400">Sentinel Pulse</div>
      {content}
    </section>
  );
}
