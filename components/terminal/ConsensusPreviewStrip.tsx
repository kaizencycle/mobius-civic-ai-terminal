'use client';

import { cn } from '@/lib/terminal/utils';

export type ConsensusAgentState = {
  name: string;
  verdict: 'approve' | 'caution' | 'block' | 'pending';
  note: string;
};

const VERDICT_TONE: Record<ConsensusAgentState['verdict'], string> = {
  approve: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
  caution: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  block: 'border-rose-500/20 bg-rose-500/10 text-rose-300',
  pending: 'border-slate-700 bg-slate-900 text-slate-300',
};

export default function ConsensusPreviewStrip({
  title,
  subtitle,
  agents,
}: {
  title?: string;
  subtitle?: string;
  agents: ConsensusAgentState[];
}) {
  return (
    <section className="border-b border-slate-800 bg-slate-950/80 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-mono font-semibold uppercase tracking-[0.2em] text-sky-300">
            {title ?? 'Consensus Preview'}
          </div>
          <div className="mt-1 text-xs font-sans text-slate-500">
            {subtitle ?? 'ZEUS, EVE, AUREA, HERMES, JADE, and ATLAS posture before major operator actions.'}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {agents.map((agent) => (
            <div key={agent.name} className={cn('min-w-[122px] rounded-md border px-3 py-2', VERDICT_TONE[agent.verdict])}>
              <div className="text-[11px] font-mono uppercase tracking-[0.15em]">{agent.name}</div>
              <div className="mt-1 text-[11px] font-mono uppercase tracking-[0.15em] opacity-90">{agent.verdict}</div>
              <div className="mt-1 text-xs font-sans text-current/80">{agent.note}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
