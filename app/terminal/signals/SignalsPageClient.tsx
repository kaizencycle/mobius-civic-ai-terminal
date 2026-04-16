'use client';

import { useMemo } from 'react';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';

type SignalEntry = {
  agentName: string;
  source: string;
  value: number;
  label: string;
  severity: string;
  timestamp: string;
};

type AgentResult = {
  agentName: string;
  signals: SignalEntry[];
  healthy: boolean;
  polledAt?: string;
  errors?: string[];
};

type MicroSweepPayload = {
  agents?: AgentResult[];
  allSignals?: SignalEntry[];
  instrumentCount?: number;
  composite?: number;
  timestamp?: string;
};

const FAMILIES: Array<{
  id: string;
  label: string;
  focus: string;
  color: string;
  borderColor: string;
  bgColor: string;
}> = [
  { id: 'ATLAS', label: 'ATLAS', focus: 'Strategic / Planetary', color: 'text-cyan-300', borderColor: 'border-cyan-500/30', bgColor: 'bg-cyan-500/5' },
  { id: 'ZEUS', label: 'ZEUS', focus: 'Verification / Knowledge', color: 'text-yellow-300', borderColor: 'border-yellow-500/30', bgColor: 'bg-yellow-500/5' },
  { id: 'HERMES', label: 'HERMES', focus: 'Narrative / Information', color: 'text-rose-300', borderColor: 'border-rose-500/30', bgColor: 'bg-rose-500/5' },
  { id: 'AUREA', label: 'AUREA', focus: 'Governance / Civic', color: 'text-amber-300', borderColor: 'border-amber-500/30', bgColor: 'bg-amber-500/5' },
  { id: 'JADE', label: 'JADE', focus: 'Memory / Culture', color: 'text-emerald-300', borderColor: 'border-emerald-500/30', bgColor: 'bg-emerald-500/5' },
  { id: 'DAEDALUS', label: 'DAEDALUS', focus: 'Infrastructure / Build', color: 'text-violet-300', borderColor: 'border-violet-500/30', bgColor: 'bg-violet-500/5' },
  { id: 'ECHO', label: 'ECHO', focus: 'Events / Markets', color: 'text-slate-300', borderColor: 'border-slate-500/30', bgColor: 'bg-slate-500/5' },
  { id: 'EVE', label: 'EVE', focus: 'Observer / Civic', color: 'text-rose-200', borderColor: 'border-rose-400/30', bgColor: 'bg-rose-400/5' },
];

function familyFromAgent(name: string): string {
  const m = /^([A-Z]+)-µ\d+$/.exec(name);
  return m ? m[1] : name;
}

function severityDot(sev: string) {
  if (sev === 'critical') return 'bg-rose-400';
  if (sev === 'elevated' || sev === 'watch') return 'bg-amber-400';
  return 'bg-emerald-400';
}

function relTime(ts?: string): string {
  if (!ts) return '';
  const ms = Date.now() - new Date(ts).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export default function SignalsPageClient() {
  const { snapshot, loading } = useTerminalSnapshot();
  if (loading && !snapshot) return <ChamberSkeleton blocks={4} />;

  const signalsData = snapshot?.signals?.data;
  const signals = (signalsData && typeof signalsData === 'object' ? signalsData : {}) as MicroSweepPayload;
  const agents = signals.agents ?? [];
  const expected = signals.instrumentCount ?? agents.length;

  const grouped = useMemo(() => {
    const map = new Map<string, AgentResult[]>();
    for (const family of FAMILIES) map.set(family.id, []);
    for (const agent of agents) {
      const fam = familyFromAgent(agent.agentName);
      const arr = map.get(fam);
      if (arr) arr.push(agent);
      else map.set(fam, [agent]);
    }
    return map;
  }, [agents]);

  const familyComposites = useMemo(() => {
    const out: Record<string, { avg: number; healthy: number; total: number }> = {};
    for (const [fam, members] of grouped) {
      const vals = members.flatMap((a) => a.signals.map((s) => s.value));
      const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      const healthy = members.filter((a) => a.healthy).length;
      out[fam] = { avg, healthy, total: members.length };
    }
    return out;
  }, [grouped]);

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] text-slate-400">
          <span className="font-mono text-slate-200">{agents.length}</span>
          {expected && agents.length !== expected ? (
            <span className="text-amber-400/90"> / {expected} instruments</span>
          ) : expected ? (
            <span> instruments · composite {typeof signals.composite === 'number' ? signals.composite.toFixed(3) : '—'}</span>
          ) : null}
        </div>
        {signals.timestamp ? (
          <span className="text-[10px] text-slate-500">sweep {relTime(signals.timestamp)}</span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-slate-700 bg-slate-900/80">
              <span className="text-2xl text-slate-500">⊕</span>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-200">No micro-agent signals</h2>
              <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-400">
                The signal sweep has not returned instrument data yet. This is expected when KV is not configured
                or the <code className="rounded bg-slate-800 px-1 py-0.5 text-[10px] text-slate-300">/api/signals/micro</code> endpoint
                has no upstream data.
              </p>
            </div>
            <div className="rounded border border-slate-800 bg-slate-900/50 px-4 py-3 text-left font-mono text-[10px] text-slate-500">
              <div className="mb-1 text-[9px] uppercase tracking-[0.12em] text-slate-600">Agent families awaiting data</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {FAMILIES.map((f) => (
                  <span key={f.id} className={`rounded border ${f.borderColor} ${f.bgColor} px-2 py-0.5 ${f.color}`}>
                    {f.label} <span className="text-slate-600">· {f.focus}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          FAMILIES.map((family) => {
            const members = grouped.get(family.id) ?? [];
            if (members.length === 0) return null;
            const comp = familyComposites[family.id];

            return (
              <section key={family.id} className={`rounded-lg border ${family.borderColor} ${family.bgColor} p-3`}>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <span className={`font-mono text-sm font-bold ${family.color}`}>{family.label}</span>
                    <span className="ml-2 text-[10px] text-slate-500">{family.focus}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400">
                    <span>{comp?.healthy ?? 0}/{comp?.total ?? 0} healthy</span>
                    <span className={comp && comp.avg >= 0.7 ? 'text-emerald-400' : comp && comp.avg >= 0.4 ? 'text-amber-400' : 'text-rose-400'}>
                      avg {comp ? (comp.avg * 100).toFixed(0) : '—'}%
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  {members.map((agent) => {
                    const sig = agent.signals[0];
                    const score = sig?.value ?? (agent.healthy ? 0.85 : 0);
                    const pct = Math.max(5, Math.round(score * 100));

                    return (
                      <div key={agent.agentName} className="rounded border border-slate-800 bg-slate-950/60 p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[11px] font-semibold text-slate-200">{agent.agentName}</span>
                          <span className={`h-2 w-2 rounded-full ${agent.healthy ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                        </div>
                        {sig ? (
                          <>
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-800">
                                <div
                                  className={`h-full rounded ${severityDot(sig.severity)}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="font-mono text-[10px] text-slate-400">{pct}%</span>
                            </div>
                            <div className="mt-1 text-[10px] leading-snug text-slate-400 line-clamp-2" title={sig.label}>
                              {sig.source}
                            </div>
                            <div className="mt-0.5 flex items-center justify-between text-[9px] text-slate-600">
                              <span className="flex items-center gap-1">
                                <span className={`h-1.5 w-1.5 rounded-full ${severityDot(sig.severity)}`} />
                                {sig.severity}
                              </span>
                              <span>{relTime(sig.timestamp)}</span>
                            </div>
                          </>
                        ) : (
                          <div className="mt-1.5 text-[10px] text-slate-500">
                            {agent.errors?.[0] ?? 'No signal'}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
