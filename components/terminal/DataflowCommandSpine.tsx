'use client';

import { cn } from '@/lib/utils';
import type { LaneDiagnosticsPayload } from '@/hooks/useLaneDiagnosticsChamber';
import type { ShellSnapshot } from '@/hooks/useShellSnapshot';

type StageState = 'fresh' | 'ok' | 'watch' | 'slow' | 'stale' | 'degraded' | 'offline' | 'unknown';

type DataflowStage = {
  id: string;
  label: string;
  agent: string;
  state: StageState;
  detail: string;
};

type FlowBudget = {
  label: string;
  agent: string;
  role: string;
  metric: string;
  state: StageState;
};

function normalizeState(value: unknown): StageState {
  const text = typeof value === 'string' ? value.toLowerCase() : '';
  if (text.includes('degraded') || text.includes('critical') || text.includes('failed')) return 'degraded';
  if (text.includes('stale')) return 'stale';
  if (text.includes('slow') || text.includes('pending')) return 'slow';
  if (text.includes('watch') || text.includes('elevated')) return 'watch';
  if (text.includes('fresh')) return 'fresh';
  if (text.includes('ok') || text.includes('healthy') || text.includes('nominal')) return 'ok';
  if (text.includes('offline')) return 'offline';
  return 'unknown';
}

function laneState(lanes: Record<string, unknown> | undefined, ...keys: string[]): StageState {
  if (!lanes) return 'unknown';
  for (const key of keys) {
    const row = lanes[key] as Record<string, unknown> | undefined;
    if (!row) continue;
    const state = normalizeState(row.freshness ?? row.state ?? row.status ?? row.message);
    if (state !== 'unknown') return state;
  }
  return 'unknown';
}

function shellState(shell: ShellSnapshot | null, okState: StageState, degradedState: StageState = 'watch'): StageState {
  if (!shell) return 'unknown';
  if (shell.degraded) return degradedState;
  return okState;
}

function stageClass(state: StageState): string {
  if (state === 'fresh' || state === 'ok') return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100';
  if (state === 'watch' || state === 'slow') return 'border-amber-500/35 bg-amber-500/10 text-amber-100';
  if (state === 'stale') return 'border-sky-500/30 bg-sky-500/10 text-sky-100';
  if (state === 'degraded' || state === 'offline') return 'border-rose-500/35 bg-rose-500/10 text-rose-100';
  return 'border-slate-700 bg-slate-900/60 text-slate-300';
}

function badgeLabel(state: StageState): string {
  if (state === 'fresh') return 'fresh';
  if (state === 'ok') return 'ok';
  if (state === 'watch') return 'watch';
  if (state === 'slow') return 'slow';
  if (state === 'stale') return 'stale';
  if (state === 'degraded') return 'degraded';
  if (state === 'offline') return 'offline';
  return 'unknown';
}

function ageLabel(timestamp: string | null | undefined): string {
  if (!timestamp) return '—';
  const t = new Date(timestamp).getTime();
  if (!Number.isFinite(t)) return '—';
  const seconds = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function countLaneRows(lanes: Record<string, unknown> | undefined): number {
  if (!lanes) return 0;
  return Object.keys(lanes).length;
}

function countProblemLanes(lanes: Record<string, unknown> | undefined): number {
  if (!lanes) return 0;
  return Object.values(lanes).filter((value) => {
    const row = value as Record<string, unknown> | undefined;
    const state = normalizeState(row?.freshness ?? row?.state ?? row?.status ?? row?.message);
    return state === 'watch' || state === 'slow' || state === 'stale' || state === 'degraded' || state === 'offline';
  }).length;
}

function flowBudgetClass(state: StageState): string {
  if (state === 'fresh' || state === 'ok') return 'border-emerald-500/25 text-emerald-200';
  if (state === 'watch' || state === 'slow' || state === 'stale') return 'border-amber-500/25 text-amber-200';
  if (state === 'degraded' || state === 'offline') return 'border-rose-500/30 text-rose-200';
  return 'border-slate-700 text-slate-400';
}

export default function DataflowCommandSpine({
  shell,
  diagnostics,
  visible,
}: {
  shell: ShellSnapshot | null;
  diagnostics: LaneDiagnosticsPayload | null | undefined;
  visible: boolean;
}) {
  if (!visible) return null;

  const lanes = diagnostics?.lanes;
  const laneCount = countLaneRows(lanes);
  const problemLanes = countProblemLanes(lanes);
  const dataFreshness = shell?.timestamp ?? diagnostics?.timestamp ?? null;
  const journalState = laneState(lanes, 'journal');
  const ledgerState = laneState(lanes, 'ledger', 'epicon', 'integrity');
  const verifyState = shell ? (shell.tripwire?.elevated ? 'watch' : 'ok') : 'unknown';
  const stages: DataflowStage[] = [
    {
      id: 'sources',
      label: 'Sources',
      agent: 'HERMES',
      state: laneState(lanes, 'kv', 'backup_redis', 'signals'),
      detail: `${laneCount} lanes open`,
    },
    {
      id: 'intake',
      label: 'Intake',
      agent: 'ECHO',
      state: laneState(lanes, 'heartbeat', 'journal', 'signals'),
      detail: shell?.heartbeat?.runtime ?? 'runtime pulse',
    },
    {
      id: 'normalize',
      label: 'Normalize',
      agent: 'HERMES',
      state: shellState(shell, 'ok', 'watch'),
      detail: 'packet shaping',
    },
    {
      id: 'verify',
      label: 'Verify',
      agent: 'ZEUS',
      state: verifyState,
      detail: `${shell?.tripwire?.count ?? 0} tripwires`,
    },
    {
      id: 'ledger',
      label: 'Ledger',
      agent: 'JADE',
      state: ledgerState,
      detail: 'proof lane',
    },
    {
      id: 'ui',
      label: 'UI',
      agent: 'ATLAS',
      state: shellState(shell, 'fresh', 'degraded'),
      detail: ageLabel(dataFreshness),
    },
  ];

  const budgets: FlowBudget[] = [
    {
      label: 'Open HOT',
      agent: 'ECHO',
      role: 'intake sampler',
      metric: journalState === 'unknown' ? 'awaiting journal lane' : `journal ${badgeLabel(journalState)}`,
      state: journalState,
    },
    {
      label: 'Shape',
      agent: 'HERMES',
      role: 'dedupe / packet route',
      metric: `${laneCount} lane${laneCount === 1 ? '' : 's'} visible`,
      state: laneCount > 0 ? 'ok' : 'unknown',
    },
    {
      label: 'Challenge',
      agent: 'ZEUS',
      role: 'contamination check',
      metric: `${shell?.tripwire?.count ?? 0} tripwire${(shell?.tripwire?.count ?? 0) === 1 ? '' : 's'}`,
      state: verifyState,
    },
    {
      label: 'Gate Canon',
      agent: 'JADE',
      role: 'reservoir control',
      metric: `ledger ${badgeLabel(ledgerState)}`,
      state: ledgerState,
    },
    {
      label: 'Overflow',
      agent: 'AUREA',
      role: 'pressure review',
      metric: `${problemLanes} lane${problemLanes === 1 ? '' : 's'} need care`,
      state: problemLanes > 0 ? 'watch' : laneCount > 0 ? 'ok' : 'unknown',
    },
  ];

  const packetMode = shell?.source === 'fallback' || diagnostics?.fallback ? 'preview/fallback' : shell ? 'live packet' : 'awaiting shell';

  return (
    <section className="border-b border-cyan-950/60 bg-slate-950/85 px-3 py-2 md:px-4" aria-label="Dataflow command spine">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-cyan-300/80">Dataflow Command</div>
          <div className="text-[11px] text-slate-500">Open-lane flow · agents govern pressure before canon</div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[10px] font-mono uppercase tracking-[0.12em]">
          <span className="rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-slate-300">{shell?.cycle ?? 'C-—'}</span>
          <span className="rounded border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-violet-200">{packetMode}</span>
          <span className="rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-slate-300">fresh {ageLabel(dataFreshness)}</span>
        </div>
      </div>

      <div className="mb-2 grid gap-1.5 md:grid-cols-6">
        {stages.map((stage, idx) => (
          <div key={stage.id} className={cn('relative rounded border px-2 py-2', stageClass(stage.state))}>
            {idx > 0 ? <span className="absolute -left-2 top-1/2 hidden -translate-y-1/2 text-slate-600 md:block">→</span> : null}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono uppercase tracking-[0.14em]">{stage.label}</span>
              <span className="rounded bg-black/20 px-1.5 py-0.5 text-[9px] font-mono uppercase">{badgeLabel(stage.state)}</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-300/90">{stage.agent}</div>
            <div className="truncate text-[10px] text-slate-500">{stage.detail}</div>
          </div>
        ))}
      </div>

      <div className="rounded border border-slate-800/80 bg-slate-950/70 p-2">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-slate-500">Agent flow budgets</div>
          <div className="text-[9px] font-mono uppercase tracking-[0.12em] text-cyan-300/70">HOT open · CANON gated</div>
        </div>
        <div className="grid gap-1 md:grid-cols-5">
          {budgets.map((budget) => (
            <div key={`${budget.label}-${budget.agent}`} className={cn('rounded border bg-black/20 px-2 py-1.5', flowBudgetClass(budget.state))}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-mono uppercase tracking-[0.12em]">{budget.label}</span>
                <span className="text-[9px] font-mono">{budget.agent}</span>
              </div>
              <div className="truncate text-[10px] text-slate-400">{budget.role}</div>
              <div className="truncate text-[10px] text-slate-500">{budget.metric}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
