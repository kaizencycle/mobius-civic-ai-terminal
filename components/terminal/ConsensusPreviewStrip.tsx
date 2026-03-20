'use client';

/**
 * ConsensusPreviewStrip — Compact agent consensus bar.
 *
 * Defaults to a row of verdict dots and expands on click to show
 * detailed agent notes only when the operator needs them.
 */

import { useState } from 'react';
import { cn } from '@/lib/terminal/utils';

export type ConsensusAgentState = {
  name: string;
  verdict: 'approve' | 'caution' | 'block' | 'pending';
  note: string;
};

const VERDICT_DOT: Record<ConsensusAgentState['verdict'], string> = {
  approve: 'bg-emerald-400',
  caution: 'bg-amber-400',
  block: 'bg-red-400',
  pending: 'bg-slate-500',
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
  const [expanded, setExpanded] = useState(false);

  const approveCount = agents.filter((agent) => agent.verdict === 'approve').length;
  const cautionCount = agents.filter((agent) => agent.verdict === 'caution').length;
  const blockCount = agents.filter((agent) => agent.verdict === 'block').length;

  return (
    <button
      onClick={() => setExpanded((value) => !value)}
      className="w-full border-b border-slate-800 bg-slate-950/80 text-left transition-all duration-300"
    >
      <div className="flex items-center gap-3 px-4 py-1.5">
        <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.2em] text-slate-500">
          Consensus
        </span>

        <div className="flex items-center gap-1">
          {agents.map((agent) => (
            <span key={agent.name} className={cn('h-2 w-2 rounded-full transition-all', VERDICT_DOT[agent.verdict])} />
          ))}
        </div>

        <span className="text-[10px] font-mono text-slate-500">
          {approveCount > 0 && <span className="text-emerald-400">{approveCount}✓</span>}
          {cautionCount > 0 && <span className="ml-1 text-amber-400">{cautionCount}⚠</span>}
          {blockCount > 0 && <span className="ml-1 text-red-400">{blockCount}✕</span>}
        </span>

        {subtitle && (
          <span className="hidden max-w-xs truncate text-[10px] font-mono text-slate-600 sm:inline">
            {subtitle}
          </span>
        )}

        <span className={cn('ml-auto text-[10px] font-mono text-slate-600 transition-transform duration-300', expanded && 'rotate-180')}>
          ▾
        </span>
      </div>

      <div
        className={cn(
          'overflow-hidden transition-all duration-300 ease-out',
          expanded ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <div className="px-4 pb-3">
          {title && <div className="mb-2 text-[10px] font-mono uppercase tracking-[0.15em] text-sky-300">{title}</div>}
          <div className="flex flex-wrap gap-2">
            {agents.map((agent) => (
              <div key={agent.name} className={cn('min-w-[110px] rounded-md border px-2.5 py-1.5', VERDICT_TONE[agent.verdict])}>
                <div className="flex items-center gap-1.5">
                  <span className={cn('h-1.5 w-1.5 rounded-full', VERDICT_DOT[agent.verdict])} />
                  <span className="text-[10px] font-mono uppercase tracking-[0.12em]">{agent.name}</span>
                </div>
                <div className="mt-1 text-[10px] leading-tight text-current/80">{agent.note}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}
