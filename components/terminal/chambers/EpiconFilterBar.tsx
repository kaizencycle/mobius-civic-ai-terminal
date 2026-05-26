'use client';

import { useState } from 'react';
import type { EpiconEvent, ConfidenceTier } from '@/lib/terminal/epicon';

const TIERS: ConfidenceTier[] = ['VERIFIED', 'PENDING', 'CONTRADICTED', 'ARCHIVED'];
const AGENTS = ['ATLAS', 'ZEUS', 'EVE', 'JADE', 'HERMES', 'ECHO', 'AUREA', 'DAEDALUS'];

type TierFilter = ConfidenceTier | 'ALL';

interface Props {
  events: EpiconEvent[];
  onFilter: (filtered: EpiconEvent[]) => void;
}

export function EpiconFilterBar({ events, onFilter }: Props) {
  const [tier, setTier]   = useState<TierFilter>('ALL');
  const [agent, setAgent] = useState<string>('ALL');
  const [query, setQuery] = useState('');

  function apply(newTier = tier, newAgent = agent, newQuery = query) {
    let out = events;
    if (newTier  !== 'ALL') out = out.filter((e) => e.tier  === newTier);
    if (newAgent !== 'ALL') out = out.filter((e) => e.agent === newAgent);
    if (newQuery)            out = out.filter((e) =>
      e.label.toLowerCase().includes(newQuery.toLowerCase()) ||
      e.summary.toLowerCase().includes(newQuery.toLowerCase())
    );
    onFilter(out);
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-950/40 flex-wrap font-mono text-[10px]">
      <div className="flex gap-1 flex-wrap">
        {(['ALL', ...TIERS] as TierFilter[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setTier(t); apply(t); }}
            className={`px-2 py-0.5 rounded border transition-colors ${
              tier === t
                ? 'bg-fuchsia-950 border-fuchsia-700 text-fuchsia-300'
                : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <select
        value={agent}
        onChange={(e) => { setAgent(e.target.value); apply(tier, e.target.value); }}
        className="bg-zinc-900 border border-zinc-700 text-zinc-400 rounded px-2 py-0.5 text-[10px] font-mono hover:border-zinc-500 transition-colors"
      >
        <option value="ALL">ALL AGENTS</option>
        {AGENTS.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>

      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); apply(tier, agent, e.target.value); }}
        placeholder="search events…"
        className="flex-1 min-w-[120px] bg-zinc-900 border border-zinc-700 text-zinc-300 rounded px-2 py-0.5 text-[10px] font-mono placeholder-zinc-700 focus:outline-none focus:border-fuchsia-700 transition-colors"
      />
    </div>
  );
}
