'use client';

import type { MicGenesisBlockSummary } from '@/lib/mic/types';
import { ChainIntegrityCard } from '@/components/mic/ChainIntegrityCard';

export function GenesisBlockViewer({ block }: { block: MicGenesisBlockSummary }) {
  return (
    <div className="rounded-2xl border border-violet-900/35 bg-slate-950/75 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-violet-300/90">Genesis block</h2>
          <p className="mt-0.5 font-mono text-[11px] text-slate-400">
            {block.type ?? 'MIC_GENESIS_BLOCK'} · {block.cycle}
          </p>
        </div>
        <div className="text-[10px] text-slate-500">{block.timestamp}</div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="space-y-1 font-mono text-[11px] text-slate-300">
          <div>GI: {block.gi}</div>
          <div>Mint: {block.mint} MIC</div>
          <div className="pt-1 font-medium text-slate-500">Allocation</div>
          <div>Reserve: {block.allocation?.reserve ?? '—'}</div>
          <div>Operator: {block.allocation?.operator ?? '—'}</div>
          <div>Sentinel: {block.allocation?.sentinel ?? '—'}</div>
          <div>Civic: {block.allocation?.civic ?? '—'}</div>
          <div>Burn: {block.allocation?.burn ?? '—'}</div>
        </div>
        <ChainIntegrityCard
          hash={block.hash}
          previousHash={block.previous_hash}
          algorithm={block.hash_algorithm ?? 'sha256'}
        />
      </div>
    </div>
  );
}
