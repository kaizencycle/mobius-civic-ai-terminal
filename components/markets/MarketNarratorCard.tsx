'use client';

import { useEffect, useState } from 'react';
import type { MarketNarrationPayload, NarratorAgent } from '@/lib/markets/narrator';

function buttonTone(active: boolean) {
  return active
    ? 'border-sky-500/30 bg-sky-500/10 text-sky-200'
    : 'border-slate-700 bg-slate-900 text-slate-400';
}

export default function MarketNarratorCard() {
  const [agent, setAgent] = useState<NarratorAgent>('aurea');
  const [data, setData] = useState<MarketNarrationPayload | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await fetch(`/api/markets/narrator?agent=${agent}`, {
          cache: 'no-store',
        });
        const json = await res.json();
        if (!alive || !json.ok) return;
        setData(json);
      } catch {
        // preserve old state
      }
    }

    load();
    const interval = setInterval(load, 60_000);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [agent]);

  async function handleCopy() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.postSummary);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  if (!data) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Narrator Mode</div>
        <div className="mt-3 text-sm text-slate-400">Composing agent voice summary</div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Narrator Mode</div>
          <div className="mt-1 text-sm text-slate-300">{data.title}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAgent('aurea')}
            className={`rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${buttonTone(agent === 'aurea')}`}
          >
            AUREA
          </button>
          <button
            type="button"
            onClick={() => setAgent('hermes')}
            className={`rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${buttonTone(agent === 'hermes')}`}
          >
            HERMES
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Short Summary</div>
        <div className="mt-1 text-sm text-white">{data.shortSummary}</div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Spoken Summary</div>
        <div className="mt-1 text-sm text-slate-300">{data.spokenSummary}</div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Post Summary</div>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-300"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-slate-300">
          {data.postSummary}
        </pre>
      </div>
    </section>
  );
}
