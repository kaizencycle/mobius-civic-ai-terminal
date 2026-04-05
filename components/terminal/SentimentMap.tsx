'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { AgentJournalEntry } from '@/lib/terminal/types';

type DomainKey = 'civic' | 'environ' | 'financial' | 'narrative' | 'infrastructure' | 'institutional';

type DomainSnapshot = {
  key: DomainKey;
  label: string;
  agent: string;
  score: number | null;
  trend: 'up' | 'down' | 'flat';
  status: 'nominal' | 'stressed' | 'critical' | 'unknown';
  sourceLabel: string;
};

type DomainReading = {
  timestamp: string;
  value: number | null;
  sourceLabel: string;
};

type Props = {
  cycleId: string;
  timestamp: string;
  gi: number;
  overallSentiment: number | null;
  domains: DomainSnapshot[];
  history: Partial<Record<DomainKey, DomainReading[]>>;
  journalEntries: AgentJournalEntry[];
  onAskAgent: (agent: string, domain: string) => void;
};

function trendGlyph(trend: DomainSnapshot['trend']): string {
  if (trend === 'up') return '↑';
  if (trend === 'down') return '↓';
  return '↔';
}

function statusTone(status: DomainSnapshot['status']): string {
  if (status === 'nominal') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  if (status === 'stressed') return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  if (status === 'critical') return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
  return 'border-slate-600 bg-slate-800/70 text-slate-300';
}

function barTone(value: number | null): string {
  if (value === null) return 'bg-slate-700';
  if (value >= 0.8) return 'bg-emerald-400';
  if (value >= 0.6) return 'bg-sky-400';
  if (value >= 0.4) return 'bg-amber-400';
  return 'bg-rose-400';
}

export default function SentimentMap({
  cycleId,
  timestamp,
  gi,
  overallSentiment,
  domains,
  history,
  journalEntries,
  onAskAgent,
}: Props) {
  const [expandedDomain, setExpandedDomain] = useState<DomainKey | null>(null);

  const journalByAgent = useMemo(() => {
    const map = new Map<string, AgentJournalEntry[]>();
    for (const entry of journalEntries) {
      const rows = map.get(entry.agent) ?? [];
      rows.push(entry);
      map.set(entry.agent, rows);
    }
    for (const [, rows] of map) {
      rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }
    return map;
  }, [journalEntries]);

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <div className="mb-3 border-b border-slate-800 pb-3">
        <div className="text-sm font-semibold uppercase tracking-[0.08em]">Global Sentiment Map</div>
        <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400">
          {cycleId} · {timestamp.slice(11, 16)} UTC · GI {gi.toFixed(3)} · Overall {overallSentiment === null ? '--' : overallSentiment.toFixed(3)}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {domains.map((domain) => {
          const value = domain.score;
          const pct = value === null ? 0 : Math.max(0, Math.min(100, Math.round(value * 100)));
          const isOpen = expandedDomain === domain.key;
          const latestJournal = (journalByAgent.get(domain.agent) ?? [])[0] ?? null;
          const recent = history[domain.key] ?? [];

          return (
            <div key={domain.key} className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
              <button className="w-full text-left" onClick={() => setExpandedDomain((prev) => (prev === domain.key ? null : domain.key))}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-slate-400">{domain.label}</div>
                    <div className="mt-1 text-lg font-semibold text-slate-100">{value === null ? '--' : value.toFixed(2)}</div>
                  </div>
                  <div className="text-right">
                    <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-mono uppercase', statusTone(domain.status))}>{domain.status}</span>
                    <div className="mt-1 text-sm font-mono text-slate-300">{trendGlyph(domain.trend)}</div>
                  </div>
                </div>

                <div className="mt-2 h-2 w-full overflow-hidden rounded bg-slate-800">
                  <div className={cn('h-full transition-all', barTone(value))} style={{ width: `${pct}%` }} />
                </div>

                <div className="mt-2 flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.12em] text-slate-400">
                  <span className="rounded border border-slate-700 px-1.5 py-0.5 text-slate-300">{domain.agent}</span>
                  <span>{domain.sourceLabel}</span>
                </div>
              </button>

              {isOpen ? (
                <div className="mt-3 space-y-2 border-t border-slate-800 pt-3 text-xs text-slate-300">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500">Current Journal</div>
                    <div className="mt-1 rounded border border-slate-800 bg-slate-900/80 p-2 text-[11px]">
                      {latestJournal ? latestJournal.observation : 'No agent journal entry yet for this lane.'}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500">Last 5 Readings</div>
                    <div className="mt-1 space-y-1">
                      {recent.length === 0 ? (
                        <div className="rounded border border-dashed border-slate-700 bg-slate-950/70 p-2 text-[11px] text-slate-500">No readings yet.</div>
                      ) : (
                        recent.map((reading, idx) => (
                          <div key={`${reading.timestamp}-${idx}`} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950/70 px-2 py-1 text-[11px]">
                            <span>{reading.timestamp.slice(11, 19)} UTC</span>
                            <span className="font-mono text-slate-300">{reading.value === null ? '--' : reading.value.toFixed(3)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => onAskAgent(domain.agent, domain.label)}
                    className="w-full rounded border border-sky-500/40 bg-sky-500/10 px-2 py-1.5 text-[10px] font-mono uppercase tracking-[0.12em] text-sky-200"
                  >
                    Ask {domain.agent}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
