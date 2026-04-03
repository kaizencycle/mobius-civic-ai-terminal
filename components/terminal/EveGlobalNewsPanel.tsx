'use client';

import { useEffect, useState } from 'react';

type Tension = 'low' | 'moderate' | 'elevated' | 'high';

type EveItem = {
  id: string;
  title: string;
  url: string;
  source: string;
  region: string;
  category: string;
  severity: 'low' | 'medium' | 'high';
  eve_tag: string;
};

type EveResponse = {
  ok: boolean;
  global_tension: Tension;
  pattern_notes: string[];
  items: EveItem[];
};

const REFRESH_MS = 3 * 60 * 1000;

function tensionClass(tension: Tension): string {
  if (tension === 'high') return 'border-rose-500/60 bg-rose-500/15 text-rose-200';
  if (tension === 'elevated') return 'border-amber-500/60 bg-amber-500/15 text-amber-200';
  if (tension === 'moderate') return 'border-yellow-500/50 bg-yellow-500/10 text-yellow-200';
  return 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200';
}

function severityDot(severity: EveItem['severity']): string {
  if (severity === 'high') return 'bg-rose-400';
  if (severity === 'medium') return 'bg-amber-400';
  return 'bg-emerald-400';
}

export default function EveGlobalNewsPanel() {
  const [data, setData] = useState<EveResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch('/api/eve/global-news', { cache: 'no-store' });
        if (!res.ok) throw new Error(`EVE feed failed (${res.status})`);
        const json = (await res.json()) as EveResponse;
        if (!json.ok) throw new Error('EVE feed unavailable');

        if (!cancelled) {
          setData(json);
          setError(null);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Unable to load EVE feed');
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

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-[0.18em] text-slate-400">EVE Governance / Ethics</div>
        {data && (
          <span className={`rounded-md border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.14em] ${tensionClass(data.global_tension)}`}>
            {data.global_tension}
          </span>
        )}
      </div>

      {loading && <div className="text-sm text-slate-400">Loading EVE synthesis…</div>}
      {error && <div className="text-sm text-rose-300">{error}</div>}

      {!loading && !error && data && (
        <div className="space-y-3">
          {data.pattern_notes.slice(0, 2).map((note) => (
            <div key={note} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-300">
              {note}
            </div>
          ))}

          <ul className="space-y-2">
            {data.items.slice(0, 8).map((item) => (
              <li key={item.id} className="cv-auto rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                <a href={item.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-slate-100 hover:text-cyan-300">
                  {item.title}
                </a>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-slate-400">
                  <span className={`inline-block h-2 w-2 rounded-full ${severityDot(item.severity)}`} />
                  <span>{item.category}</span>
                  <span>·</span>
                  <span>{item.region}</span>
                  <span>·</span>
                  <span>{item.source}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">{item.eve_tag}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
