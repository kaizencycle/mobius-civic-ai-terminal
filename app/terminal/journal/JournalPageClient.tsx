'use client';

import { useEffect, useMemo, useState } from 'react';
import ChamberEmptyState from '@/components/terminal/ChamberEmptyState';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';

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
  const [derivedMode, setDerivedMode] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [journalRes, epiconRes] = await Promise.allSettled([
        fetch('/api/agents/journal?agent=ALL&limit=200', { cache: 'no-store' }).then((r) => r.json() as Promise<JournalResponse>),
        fetch('/api/epicon/feed?limit=100', { cache: 'no-store' }).then((r) => r.json() as Promise<{ items?: EpiconItem[] }>),
      ]);

      if (!mounted) return;

      const journalEntries = journalRes.status === 'fulfilled' ? (journalRes.value.entries ?? []) : [];
      if (journalEntries.length > 0) {
        setDerivedMode(false);
        setEntries(journalEntries);
        return;
      }

      const epiconItems = epiconRes.status === 'fulfilled' ? epiconRes.value.items ?? [] : [];
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
  const filtered = useMemo(
    () => (agent === 'ALL' ? entries ?? [] : (entries ?? []).filter((e) => e.agent === agent)),
    [entries, agent],
  );

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
            title="Journal archive initializing"
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
