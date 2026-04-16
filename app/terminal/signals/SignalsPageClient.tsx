'use client';

import { useMemo } from 'react';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import { useTerminalSnapshot, type SnapshotLaneState } from '@/hooks/useTerminalSnapshot';

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
  { id: 'THEMIS', label: 'THEMIS', focus: 'Governance / Transparency', color: 'text-amber-200', borderColor: 'border-amber-400/30', bgColor: 'bg-amber-400/5' },
  { id: 'JADE', label: 'JADE', focus: 'Memory / Culture', color: 'text-emerald-300', borderColor: 'border-emerald-500/30', bgColor: 'bg-emerald-500/5' },
  { id: 'DAEDALUS', label: 'DAEDALUS', focus: 'Infrastructure / Build', color: 'text-violet-300', borderColor: 'border-violet-500/30', bgColor: 'bg-violet-500/5' },
  { id: 'ECHO', label: 'ECHO', focus: 'Events / Markets', color: 'text-slate-300', borderColor: 'border-slate-500/30', bgColor: 'bg-slate-500/5' },
  { id: 'EVE', label: 'EVE', focus: 'Observer / Civic', color: 'text-rose-200', borderColor: 'border-rose-400/30', bgColor: 'bg-rose-400/5' },
  { id: 'GAIA', label: 'GAIA', focus: 'Environmental / Planetary', color: 'text-teal-300', borderColor: 'border-teal-500/30', bgColor: 'bg-teal-500/5' },
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

function agentPosture(agent: AgentResult, signalsLane: SnapshotLaneState | undefined): AgentPosture {
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

export default function SignalsPageClient() {
  const { snapshot, loading, error } = useTerminalSnapshot();
  if (loading && !snapshot) return <ChamberSkeleton blocks={4} />;

  const signalsLeaf = snapshot?.signals;
  const signalsData = signalsLeaf?.data;
  const payload = (signalsData && typeof signalsData === 'object' ? signalsData : {}) as MicroSweepPayload;
  const agents = useMemo(() => resolveAgents(payload), [payload]);

  const signalsLane = snapshot?.lanes?.find((l) => l.key === 'signals');
  const laneStale = signalsLane?.state === 'stale';

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

  const displayFamilyIds = useMemo(() => {
    const preferred = FAMILIES.map((f) => f.id);
    const keysWithMembers = [...grouped.entries()].filter(([, m]) => m.length > 0).map(([k]) => k);
    const ordered = [
      ...preferred.filter((k) => keysWithMembers.includes(k)),
      ...keysWithMembers.filter((k) => !preferred.includes(k)).sort(),
    ];
    return ordered;
  }, [grouped]);

  const expected = payload.instrumentCount ?? agents.length;
  const sweepOk = payload.ok !== false && signalsLeaf?.ok !== false;

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-4">
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

      {!signalsLeaf?.ok && signalsLeaf?.error ? (
        <div className="rounded border border-amber-900/40 bg-amber-950/10 px-3 py-2 text-[11px] text-amber-100/90">
          Signals lane: {signalsLeaf.error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        {agents.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-[11px] text-slate-500">
            No micro-agent sweep in this snapshot yet. When the full terminal snapshot loads, instrument names appear here.
            {snapshot?.lite ? ' (Lite snapshot has no per-instrument list.)' : null}
          </div>
        ) : null}

        {displayFamilyIds.map((familyId) => {
          const members = grouped.get(familyId) ?? [];
          if (members.length === 0) return null;
          const style = familyStyle(familyId);
          const healthyN = members.filter((a) => a.healthy).length;

          return (
            <section key={familyId} className={`rounded-lg border ${style.borderColor} ${style.bgColor} p-3`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <span className={`font-mono text-sm font-bold ${style.color}`}>{style.label}</span>
                  {style.focus ? <span className="ml-2 text-[10px] text-slate-500">{style.focus}</span> : null}
                </div>
                <div className="text-[10px] font-mono text-slate-500">
                  {healthyN}/{members.length} reporting
                </div>
              </div>

              <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {members.map((agent) => {
                  const posture = agentPosture(agent, signalsLane);
                  return (
                    <li
                      key={agent.agentName}
                      className="flex items-center justify-between gap-2 rounded border border-slate-800/80 bg-slate-950/50 px-2.5 py-2"
                    >
                      <span className="min-w-0 truncate font-mono text-[11px] font-medium text-slate-200" title={agent.agentName}>
                        {agent.agentName}
                      </span>
                      <PostureBadge posture={posture} laneStale={laneStale && posture === 'degraded'} />
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
