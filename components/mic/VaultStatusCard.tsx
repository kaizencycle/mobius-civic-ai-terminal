'use client';

import type { MicReadinessResponse } from '@/lib/mic/types';

export function VaultStatusCard({ reserve }: { reserve: MicReadinessResponse['reserve'] }) {
  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-950/70 p-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Vault / reserve</h3>
      <div className="mt-2 space-y-1 font-mono text-[11px] text-slate-300">
        <div>
          In progress: <span className="text-cyan-200">{reserve.inProgressBalance.toFixed(4)}</span>
        </div>
        <div>Tranche target: {reserve.trancheTarget.toFixed(2)}</div>
        <div>Sealed total: {reserve.sealedReserveTotal.toFixed(2)}</div>
        <div className="text-slate-500">v1 cumulative (compat): {reserve.balanceReserveV1.toFixed(4)}</div>
        <div>
          Tranche status: <span className="text-amber-200/90">{reserve.trancheStatus}</span>
        </div>
      </div>
    </div>
  );
}
