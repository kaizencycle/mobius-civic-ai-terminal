'use client';

import { useState } from 'react';

const canonical = 'Canonical: Preserve event chronology, confidence, and source lineage before any narrative compression.';
const civic = 'Civic: Tell people what changed, what matters, and what remains uncertain without turning science into spectacle.';

export default function JadeScienceTranslationCard() {
  const [mode, setMode] = useState<'canonical' | 'civic'>('canonical');

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">JADE Translation</div>
          <div className="mt-1 text-sm text-slate-300">Switch between expert framing and civic-readable language.</div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setMode('canonical')} className={`rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${mode === 'canonical' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 bg-slate-900 text-slate-400'}`}>
            Canonical
          </button>
          <button type="button" onClick={() => setMode('civic')} className={`rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.12em] ${mode === 'civic' ? 'border-sky-500/30 bg-sky-500/10 text-sky-200' : 'border-slate-700 bg-slate-900 text-slate-400'}`}>
            Civic
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-200">
        {mode === 'canonical' ? canonical : civic}
      </div>
    </section>
  );
}
