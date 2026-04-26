'use client';

import { useMemo } from 'react';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import { useSignalsChamber } from '@/hooks/useSignalsChamber';

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
  mode?: string;
};

type MicroSweepPayload = {
  agents?: AgentResult[];
  allSignals?: SignalEntry[];
  instrumentCount?: number;
  composite?: number;
  timestamp?: string;
  ok?: boolean;
  cached?: boolean;
  source?: string;
};

type AgentPosture = 'live' | 'degraded' | 'standby';

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
  // OPT-6 (C-291): THEMIS removed — not in agent roster or signal sweep (dead slot).
  { id: 'JADE', label: 'JADE', focus: 'Memory / Culture', color: 'text-emerald-300', borderColor: 'border-emerald-500/30', bgColor: 'bg-emerald-500/5' },
  { id: 'DAEDALUS', label: 'DAEDALUS', focus: 'Infrastructure / Build', color: 'text-violet-300', borderColor: 'border-violet-500/30', bgColor: 'bg-violet-500/5' },
  { id: 'ECHO', label: 'ECHO', focus: 'Events / Markets', color: 'text-slate-300', borderColor: 'border-slate-500/30', bgColor: 'bg-slate-500/5' },
  { id: 'EVE', label: 'EVE', focus: 'Observer / Civic', color: 'text-rose-200', borderColor: 'border-rose-400/30', bgColor: 'bg-rose-400/5' },
  // OPT-6 (C-291): GAIA removed — not in agent roster or signal sweep (dead slot).
];

const UNKNOWN_FAMILY_STYLE = {
  id: '',
  label: '',
  focus: 'Micro instruments',
  color: 'text-slate-300',
  borderColor: 'border-slate-600/40',
  bgColor: 'bg-slate-900/40',
};

function normalizeAgentKey(name: string): string {
  return name.replace(/\u03bc/g, 'u');
}

/** Parent family id for grouping (handles µ / u and legacy names like GAIA, HERMES-µ). */
function familyFromAgent(name: string): string {
  const n = normalizeAgentKey(name);
  const numbered = /^([A-Z]+)-u\d+$/i.exec(n);
  if (numbered) return numbered[1]!.toUpperCase();
  const legacy = /^([A-Z]+)-u$/i.exec(n);
  if (legacy) return legacy[1]!.toUpperCase();
  const bare = /^([A-Z]+)$/i.exec(n.trim());
  if (bare) return bare[1]!.toUpperCase();
  return n.split(/[-\s]/)[0]?.toUpperCase() ?? 'UNKNOWN';
}

function familyStyle(id: string) {
  return FAMILIES.find((f) => f.id === id) ?? { ...UNKNOWN_FAMILY_STYLE, id, label: id };
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

function synthesizeAgentsFromSignals(allSignals: SignalEntry[]): AgentResult[] {
  const byName = new Map<string, SignalEntry[]>();
  for (const s of allSignals) {
    const key = s.agentName || 'unknown';
    const arr = byName.get(key) ?? [];
    arr.push(s);
    byName.set(key, arr);
  }
  return [...byName.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([agentName, signals]) => ({
      agentName,
      signals,
      healthy: signals.length > 0,
    }));
}

function resolveAgents(payload: MicroSweepPayload): AgentResult[] {
  const direct = payload.agents ?? [];
  if (direct.length > 0) return direct;
  const flat = payload.allSignals ?? [];
  if (flat.length === 0) return [];
  return synthesizeAgentsFromSignals(flat);
}

function worstSeverity(signals: SignalEntry[]): string {
  const order = ['nominal', 'watch', 'elevated', 'critical'];
  let worst = 0;
  for (const s of signals) {
    const i = order.indexOf(s.severity);
    if (i >= 0 && i > worst) worst = i;
  }
  return order[worst] ?? 'nominal';
}

function severityDot(severity: string): string {
  const s = severity.toLowerCase();
  if (s === 'critical') return 'bg-rose-400';
  if (s === 'elevated') return 'bg-amber-400';
  if (s === 'watch') return 'bg-yellow-400';
  return 'bg-emerald-400';
}

type FamilyComposite = { healthy: number; total: number; avg: number };

function agentPosture(agent: AgentResult, signalsLane: { ok?: boolean; state?: string } | undefined): AgentPosture {
  if (!signalsLane?.ok || signalsLane.state === 'offline') return 'standby';
  if (signalsLane.state === 'degraded' || signalsLane.state === 'stale') {
    if (!agent.healthy && agent.signals.length === 0) return 'standby';
    return 'degraded';
  }
  if (!agent.healthy || agent.signals.length === 0) return 'degraded';
  const sev = worstSeverity(agent.signals);
  if (sev === 'elevated' || sev === 'critical') return 'degraded';
  return 'live';
}

function PostureBadge({ posture, laneStale }: { posture: AgentPosture; laneStale: boolean }) {
  if (posture === 'live') {
    return (
      <span className="rounded border border-emerald-600/50 bg-emerald-950/50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-300">
        live
      </span>
    );
  }
  if (posture === 'standby') {
    return (
      <span className="rounded border border-slate-600/60 bg-slate-900/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
        standby
      </span>
    );
  }
  return (
    <span
      className="rounded border border-amber-600/50 bg-amber-950/40 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-200"
      title={laneStale ? 'Sweep or lane is stale' : undefined}
    >
      degraded{laneStale ? ' · stale' : ''}
    </span>
  );
}

function RadarSixDomain({
  scores,
}: {
  scores: Array<{ label: string; score: number; family: string }>;
}) {
  const size = 260;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 92;
  const polygon = scores
    .map((entry, index) => {
      const angle = (index / scores.length) * Math.PI * 2 - Math.PI / 2;
      const r = maxR * Math.min(Math.max(entry.score, 0), 1);
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="rounded border border-cyan-900/40 bg-slate-950/70 p-3">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-200/90">Signals six-domain radar</div>
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-[230px] w-[230px]" aria-hidden="true">
          {[0.25, 0.5, 0.75, 1].map((layer) => {
            const ring = scores
              .map((_, index) => {
                const angle = (index / scores.length) * Math.PI * 2 - Math.PI / 2;
                const x = cx + Math.cos(angle) * maxR * layer;
                const y = cy + Math.sin(angle) * maxR * layer;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
              })
              .join(' ');
            return <polygon key={layer} points={ring} fill="none" stroke="rgba(148,163,184,0.2)" strokeWidth="0.8" />;
          })}
          {scores.map((_, index) => {
            const angle = (index / scores.length) * Math.PI * 2 - Math.PI / 2;
            const x = cx + Math.cos(angle) * maxR;
            const y = cy + Math.sin(angle) * maxR;
            return <line key={`axis-${index}`} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(100,116,139,0.25)" strokeWidth="0.8" />;
          })}
          <polygon points={polygon} fill="rgba(34,211,238,0.18)" stroke="rgba(103,232,249,0.95)" strokeWidth="1.3" />
          {scores.map((entry, index) => {
            const angle = (index / scores.length) * Math.PI * 2 - Math.PI / 2;
            const x = cx + Math.cos(angle) * maxR * Math.min(Math.max(entry.score, 0), 1);
            const y = cy + Math.sin(angle) * maxR * Math.min(Math.max(entry.score, 0), 1);
            return <circle key={entry.label} cx={x} cy={y} r={2.8} fill="rgba(125,211,252,0.95)" />;
          })}
        </svg>
        <div className="grid gap-2 sm:grid-cols-2">
          {scores.map((entry) => (
            <div key={entry.label} className="rounded border border-slate-800/90 bg-slate-900/70 px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-slate-300">{entry.label}</span>
                <span className="font-mono text-[10px] text-cyan-200">{entry.score.toFixed(3)}</span>
              </div>
              <div className="mt-1 text-[10px] text-slate-500">{entry.family}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SignalsPageClient() {
  const { data, loading, error, preview, full, stabilizationActive } = useSignalsChamber(true);

  const payload = ((data?.raw && typeof data.raw === 'object') ? data.raw : {}) as MicroSweepPayload;
  const agents = useMemo(() => resolveAgents(payload), [payload]);
  const signalsLeaf = { ok: !data?.fallback, error: data?.fallback ? 'signals chamber fallback' : null };
  const laneStale = false;

  const grouped = useMemo(() => {
    const map = new Map<string, AgentResult[]>();
    for (const agent of agents) {
      const fam = familyFromAgent(agent.agentName);
      const arr = map.get(fam) ?? [];
      arr.push(agent);
      map.set(fam, arr);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.agentName.localeCompare(b.agentName));
    }
    return map;
  }, [agents]);

  const familyComposites = useMemo(() => {
    const out: Record<string, FamilyComposite> = {};
    for (const [familyId, members] of grouped) {
      if (members.length === 0) continue;
      let sum = 0;
      let healthy = 0;
      for (const agent of members) {
        if (agent.healthy) healthy += 1;
        const sig = agent.signals[0];
        const score = sig?.value ?? (agent.healthy ? 0.85 : 0);
        sum += score;
      }
      out[familyId] = {
        healthy,
        total: members.length,
        avg: sum / members.length,
      };
    }
    return out;
  }, [grouped]);
  const radarScores = useMemo(() => {
    const byFamily = (id: string, fallback: number) => familyComposites[id]?.avg ?? fallback;
    return [
      { label: 'CIVIC', score: byFamily('EVE', 0.45), family: 'EVE' },
      { label: 'ENVIRON', score: byFamily('JADE', 0.45), family: 'JADE' },
      { label: 'FINANCIAL', score: byFamily('ECHO', 0.45), family: 'ECHO' },
      { label: 'NARRATIVE', score: byFamily('HERMES', 0.45), family: 'HERMES' },
      { label: 'INFRASTR', score: byFamily('DAEDALUS', 0.45), family: 'DAEDALUS' },
      {
        label: 'INSTITUTIONAL',
        score: Math.min(1, ((familyComposites.ATLAS?.avg ?? 0.45) + (familyComposites.ZEUS?.avg ?? 0.45)) / 2),
        family: 'ATLAS/ZEUS',
      },
    ];
  }, [familyComposites]);

  if (loading && !data) return <ChamberSkeleton blocks={4} />;

  const expected = payload.instrumentCount ?? agents.length;
  const sweepOk = payload.ok !== false && signalsLeaf?.ok !== false;

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-4">
      {stabilizationActive ? (
        <div className="rounded border border-amber-700/50 bg-amber-950/30 px-3 py-1 text-[10px] text-amber-100">
          ⚠ Predictive Stabilization Active · Preview state prioritized due to integrity drift
        </div>
      ) : null}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] text-slate-400">
          <span className="font-mono text-slate-200">{agents.length}</span>
          {expected && agents.length !== expected ? (
            <span className="text-amber-400/90"> / {expected} instruments</span>
          ) : expected ? (
            <span> micro instruments</span>
          ) : null}
          {typeof payload.composite === 'number' && sweepOk ? (
            <span className="ml-2 text-slate-500">· sweep composite {payload.composite.toFixed(3)}</span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
          {payload.timestamp ? <span>sweep {relTime(payload.timestamp)}</span> : null}
          {payload.cached ? <span className="text-slate-600">· cached sweep</span> : null}
          {payload.source === 'kv-fallback' ? <span className="text-amber-500/90">· KV fallback</span> : null}
        </div>
      </div>

      {error ? (
        <div className="rounded border border-rose-900/50 bg-rose-950/20 px-3 py-2 text-[11px] text-rose-200">{error}</div>
      ) : null}
      {preview && !full ? (
        <div className="rounded border border-cyan-900/50 bg-cyan-950/20 px-3 py-2 text-[11px] text-cyan-200">
          Snapshot preview active · loading full chamber
        </div>
      ) : null}

      {!signalsLeaf?.ok && signalsLeaf?.error ? (
        <div className="rounded border border-amber-900/40 bg-amber-950/10 px-3 py-2 text-[11px] text-amber-100/90">
          Signals lane: {signalsLeaf.error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        <RadarSixDomain scores={radarScores} />
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
