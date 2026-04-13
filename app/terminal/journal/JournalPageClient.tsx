'use client';

import { useEffect, useMemo, useState } from 'react';
import ChamberEmptyState from '@/components/terminal/ChamberEmptyState';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import { currentCycleId } from '@/lib/eve/cycle-engine';

const AGENTS = ['ATLAS', 'ZEUS', 'EVE', 'AUREA', 'HERMES', 'JADE', 'DAEDALUS', 'ECHO'] as const;

type JournalEntry = {
  id: string;
  agent: string;
  cycle?: string;
  category?: string;
  observation?: string;
  inference?: string;
  recommendation?: string;
  confidence?: number;
  derivedFrom?: string[];
  source?: string;
  timestamp?: string;
};

type JournalResponse = { count?: number; entries?: JournalEntry[] };

type EpiconItem = {
  id: string;
  timestamp: string;
  author: string;
  title: string;
  type: string;
  tags: string[];
  source: string;
  severity: string;
};

function deriveAgent(item: EpiconItem): string {
  const tags = item.tags.map((tag) => tag.toLowerCase());
  if (item.type === 'zeus-verify') return 'ZEUS';
  if (item.type === 'heartbeat') return 'ATLAS';
  if (tags.includes('atlas')) return 'ATLAS';
  if (item.author === 'mobius-bot') return 'ECHO';
  return 'ATLAS';
}

function toDerivedEntry(item: EpiconItem): JournalEntry {
  return {
    id: `derived-${item.id}`,
    agent: deriveAgent(item),
    cycle: 'C-274',
    category: item.type,
    observation: item.title,
    inference: `${item.type} observed via EPICON ${item.source}.`,
    recommendation: 'Continue monitoring until native substrate journals are online.',
    source: 'epicon-derived',
    timestamp: item.timestamp,
  };
}

export default function JournalPageClient() {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  const [agent, setAgent] = useState('ALL');
  const [cycleTab, setCycleTab] = useState<string>(() => currentCycleId());
  const [derivedMode, setDerivedMode] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      // Fetch journal independently — passing agent=ALL treats "ALL" as a literal agent name
      // and returns zero results. Omitting the agent param returns entries for all agents.
      let journalEntries: JournalEntry[] = [];
      try {
        const res = await fetch('/api/agents/journal?limit=100', { cache: 'no-store' });
        const data = (await res.json()) as JournalResponse;
        journalEntries = data.entries ?? [];
      } catch {
        // network failure — fall through to epicon fallback
      }

      if (!mounted) return;

      if (journalEntries.length > 0) {
        setDerivedMode(false);
        setEntries(journalEntries);
        return;
      }

      // Only fetch epicon when journal has no entries so a slow/hung epicon endpoint
      // cannot block the journal UI indefinitely.
      let epiconItems: EpiconItem[] = [];
      try {
        const res = await fetch('/api/epicon/feed?limit=100', { cache: 'no-store' });
        const data = (await res.json()) as { items?: EpiconItem[] };
        epiconItems = data.items ?? [];
      } catch {
        // ignore
      }

      if (!mounted) return;

      const derived = epiconItems
        .filter((item) => item.type === 'zeus-verify' || item.author === 'cursor-agent' || item.author === 'mobius-bot' || item.type === 'heartbeat')
        .map(toDerivedEntry);

      setDerivedMode(derived.length > 0);
      setEntries(derived);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const agents = useMemo(
    () => ['ALL', ...Array.from(new Set((entries ?? []).map((e) => e.agent))).sort()],
    [entries],
  );

  const cycleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries ?? []) {
      const c = e.cycle?.trim();
      if (c) set.add(c);
    }
    const list = Array.from(set).sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ''), 10);
      const nb = parseInt(b.replace(/\D/g, ''), 10);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return nb - na;
      return b.localeCompare(a);
    });
    const current = currentCycleId();
    if (!list.includes(current)) list.unshift(current);
    return ['All', ...list];
  }, [entries]);

  const cycleCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries ?? []) {
      const c = e.cycle?.trim();
      if (!c) continue;
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return m;
  }, [entries]);

  const filtered = useMemo(() => {
    let rows = entries ?? [];
    if (cycleTab !== 'All') {
      rows = rows.filter((e) => (e.cycle?.trim() ?? '') === cycleTab);
    }
    if (agent !== 'ALL') {
      rows = rows.filter((e) => e.agent === agent);
    }
    return rows;
  }, [entries, agent, cycleTab]);

  if (entries === null) return <ChamberSkeleton blocks={8} />;

  return (
    <div className="h-full overflow-y-auto p-4">
      {derivedMode ? (
        <div className="mb-3 rounded border border-amber-500/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-100">
          Derived from EPICON feed · Native journals pending SUBSTRATE_GITHUB_TOKEN
        </div>
      ) : null}

      {entries.length === 0 ? (
        <div className="space-y-4">
          <ChamberEmptyState
            title="No journal entries yet for this cycle"
            reason="Agent journals initialize when automations run."
            action="To activate: set SUBSTRATE_GITHUB_TOKEN in Vercel"
            actionDetail="Use a fine-grained PAT for kaizencycle/Mobius-Substrate with Contents read + write permissions."
          />
          <div className="space-y-2 rounded border border-slate-800 bg-slate-900/60 p-3">
            <div className="text-xs text-slate-500">Journals write to Mobius-Substrate/journals/ via GitHub API on each automation cycle.</div>
            {AGENTS.map((agentName) => (
              <div key={agentName} className="flex items-center justify-between rounded border border-slate-800 px-2 py-1.5 text-xs">
                <span className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-slate-300">{agentName}</span>
                <span className="text-slate-600">Awaiting first entry · C-274</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {cycleOptions.map((c) => {
              const count = c === 'All' ? (entries?.length ?? 0) : (cycleCounts.get(c) ?? 0);
              const label = c === 'All' ? `All (${count})` : `${c} (${count})`;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCycleTab(c)}
                  className={`whitespace-nowrap rounded border px-2 py-1 text-xs ${
                    cycleTab === c
                      ? 'border-violet-400/60 bg-violet-500/10 text-violet-100'
                      : 'border-slate-700 text-slate-400'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {agents.map((name) => (
              <button
                key={name}
                onClick={() => setAgent(name)}
                className={`rounded border px-2 py-1 text-xs ${
                  agent === name
                    ? 'border-cyan-300/60 bg-cyan-400/10 text-cyan-100'
                    : 'border-slate-700 text-slate-400'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {filtered.map((entry) => (
              <article key={entry.id} className="rounded border border-slate-800 bg-slate-900/60 p-3 text-xs">
                <div className="font-mono text-slate-400">
                  {entry.agent} · {entry.cycle ?? 'C-—'} · {entry.category ?? 'journal'}
                </div>
                <div className="mt-1 text-slate-200">{entry.observation ?? '—'}</div>
                <div className="mt-1 text-slate-400">Inference: {entry.inference ?? '—'}</div>
                <div className="mt-1 text-slate-400">Recommendation: {entry.recommendation ?? '—'}</div>
                <div className="mt-1 text-slate-500">{entry.timestamp ?? '—'} · source {entry.source ?? 'journal'}</div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
