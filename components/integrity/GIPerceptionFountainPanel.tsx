'use client';

import { useEffect, useState } from 'react';
import type { IntegrityPerceptionResponse } from '@/lib/mfs/types';

function stateBadgeClass(state: string): string {
  switch (state) {
    case 'REVIEW_WINDOW_OPEN':
    case 'SUSTAINED_GI95':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
    case 'QUARANTINED':
      return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
    case 'AUDIT_REQUIRED':
    case 'PROVISIONAL_GI95':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
    default:
      return 'border-slate-600 bg-slate-800/50 text-slate-200';
  }
}

export function GIPerceptionFountainPanel({ vaultFountainLane }: { vaultFountainLane?: string | null }) {
  const [data, setData] = useState<IntegrityPerceptionResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const q = vaultFountainLane ? `?vault_lane=${encodeURIComponent(vaultFountainLane)}` : '';
    void fetch(`/api/integrity/perception${q}`, { cache: 'no-store', signal: controller.signal })
      .then(async (r) => {
        const j = (await r.json()) as IntegrityPerceptionResponse & { error?: string };
        if (!r.ok || !j.ok) {
          setErr(j.error ?? `HTTP ${r.status}`);
          return;
        }
        setData(j);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setErr('Unable to load integrity perception');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [vaultFountainLane]);

  if (loading) {
    return (
      <div className="mt-4 rounded border border-cyan-500/20 bg-slate-950/60 p-4 font-mono text-[10px] text-cyan-300/80 animate-pulse">
        PERCEPTION · assembling GI witness manifest…
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="mt-4 rounded border border-amber-500/30 bg-amber-500/5 p-4 font-mono text-[10px] text-amber-200">
        PERCEPTION DEGRADED · {err ?? 'no payload'}
      </div>
    );
  }

  const gi = data.gi_perception.gi;
  const fountain = data.fountain_state;

  return (
    <div className="mt-4 rounded border border-cyan-500/25 bg-slate-950/80 p-4 font-mono text-xs text-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-[0.2em] text-cyan-300/90">
          GI perception · Fountain eligibility (C-369)
        </div>
        <div className="flex gap-2 text-[9px]">
          {data.assembled ? (
            <span className="rounded border border-amber-500/30 px-1.5 py-0.5 text-amber-300">assembled</span>
          ) : (
            <span className="rounded border border-emerald-500/30 px-1.5 py-0.5 text-emerald-300">canonical kv</span>
          )}
          {data.degraded ? (
            <span className="rounded border border-rose-500/30 px-1.5 py-0.5 text-rose-300">degraded</span>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="space-y-2 rounded border border-slate-700/60 bg-slate-900/40 p-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Attested GI (witness)</div>
          <div className="text-2xl font-bold text-white">{(gi.value * 100).toFixed(1)}%</div>
          <div className="text-[10px] text-slate-400">
            confidence {(gi.confidence * 100).toFixed(0)}% · {gi.confidence_label ?? '—'} · diversity {gi.source_diversity}
          </div>
          <div className="text-[10px] text-slate-500">
            instruments {gi.healthy_instruments}/{gi.instrument_count} healthy · {gi.degraded_instruments} degraded · {gi.unavailable_instruments} unavailable
          </div>
          <div className="text-[10px] text-slate-500">weight {gi.weight_version}</div>
          {gi.measured_domains.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {gi.measured_domains.slice(0, 8).map((d) => (
                <span key={d} className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-slate-400">{d}</span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-2 rounded border border-slate-700/60 bg-slate-900/40 p-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Fountain state</div>
          <div className={`inline-flex rounded border px-2 py-1 text-[10px] font-semibold tracking-wide ${stateBadgeClass(fountain.state)}`}>
            {fountain.state}
          </div>
          <div className="text-[10px] text-slate-400">
            sustain {fountain.sustained_cycles_observed}/{fountain.sustained_cycles_required} cycles
          </div>
          <div className="text-[10px] text-slate-500">
            audit {fountain.audit?.status ?? '—'} · replay {fountain.audit?.adversarial_replay ?? '—'}
          </div>
          {fountain.quarantine?.active ? (
            <div className="text-[10px] text-rose-300">quarantine active</div>
          ) : null}
        </div>
      </div>

      {gi.known_blind_spots.length > 0 ? (
        <div className="mt-3 rounded border border-slate-700/50 bg-slate-900/30 p-3">
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Known blind spots</div>
          <ul className="mt-2 space-y-1 text-[10px] text-slate-400">
            {gi.known_blind_spots.map((spot) => (
              <li key={spot}>· {spot}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {fountain.public_message ? (
        <p className="mt-3 text-[10px] leading-relaxed text-slate-400 italic">{fountain.public_message}</p>
      ) : null}

      <div className="mt-3 text-[9px] text-slate-600">
        sources: {data.sources.gi} · {data.sources.fountain} · {data.sources.signals}
      </div>
    </div>
  );
}
