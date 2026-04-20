'use client';

import { useEffect, useRef, useState } from 'react';
import type { IntegrityStatusResponse } from '@/lib/mock/integrityStatus';
import { provenanceDescription, provenanceShortLabel } from '@/lib/terminal/memoryMode';
import GIMonitorOverlay from './GIMonitorOverlay';

type GIData = Pick<
  IntegrityStatusResponse,
  | 'cycle'
  | 'global_integrity'
  | 'mode'
  | 'terminal_status'
  | 'primary_driver'
  | 'summary'
  | 'timestamp'
  | 'gi_provenance'
  | 'gi_verified'
  | 'gi_age_seconds'
> & {
  signals: Pick<IntegrityStatusResponse['signals'], 'quality' | 'freshness' | 'stability' | 'system'>;
};

function statusTone(status: GIData['terminal_status']) {
  switch (status) {
    case 'nominal':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
    case 'stressed':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    case 'critical':
      return 'border-rose-500/30 bg-rose-500/10 text-rose-300';
    default:
      return 'border-slate-700 bg-slate-900 text-slate-300';
  }
}

function normalizeGIData(json: IntegrityStatusResponse): GIData {
  return {
    cycle: json.cycle,
    global_integrity: json.global_integrity,
    mode: json.mode,
    terminal_status: json.terminal_status,
    primary_driver: json.primary_driver,
    summary: json.summary,
    timestamp: json.timestamp,
    gi_provenance: json.gi_provenance ?? null,
    gi_verified: Boolean(json.gi_verified),
    gi_age_seconds: typeof json.gi_age_seconds === 'number' ? json.gi_age_seconds : null,
    signals: {
      quality: json.signals.quality,
      freshness: json.signals.freshness,
      stability: json.signals.stability,
      system: json.signals.system,
    },
  };
}

export default function GIMonitorBadge() {
  const [data, setData] = useState<GIData | null>(null);
  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const res = await fetch('/api/integrity-status', { cache: 'no-store' });
        const json = await res.json();
        if (mounted) setData(normalizeGIData(json));
      } catch {
        if (mounted) setData(null);
      }
    }

    load();
    const interval = window.setInterval(load, 15000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!data) {
    return (
      <div
        className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-400"
        role="status"
        aria-live="polite"
      >
        GI loading…
      </div>
    );
  }

  const prov = data.gi_provenance ?? '';
  const provLabel = provenanceShortLabel(prov);
  const provTitle = provenanceDescription(prov);

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setHovered(true);
      }}
      onMouseLeave={() => {
        timeoutRef.current = setTimeout(() => setHovered(false), 120);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title={provTitle}
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs uppercase tracking-[0.14em] ${statusTone(
          data.terminal_status,
        )}`}
      >
        <span>GI {(data.global_integrity * 100).toFixed(0)}%</span>
        <span className="rounded border border-white/15 px-1 font-mono text-[9px] normal-case text-slate-200/90">
          {provLabel}
          {data.gi_verified ? (
            <span className="ml-0.5" title="OAA warm-tier mirror">
              ✓
            </span>
          ) : null}
        </span>
      </button>

      {hovered && !open ? (
        <div className="absolute right-0 top-10 z-40 w-[260px] rounded-xl border border-slate-800 bg-slate-900 p-3 shadow-xl">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
            GI Preview
          </div>
          <div className="mt-2 text-lg font-semibold text-white">
            {(data.global_integrity * 100).toFixed(0)}% · {data.terminal_status}
          </div>
          <div className="mt-2 text-sm text-slate-300">{data.primary_driver}</div>
          <div className="mt-2 text-xs text-slate-500">
            {provTitle}
            {typeof data.gi_age_seconds === 'number' ? ` · age ${Math.round(data.gi_age_seconds / 60)}m` : ''}
          </div>
          <div className="mt-1 text-xs text-slate-500">Updated {new Date(data.timestamp).toLocaleString()}</div>
        </div>
      ) : null}

      {open ? <GIMonitorOverlay data={data} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
