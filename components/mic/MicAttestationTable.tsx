'use client';

import type { MicRewardAttestationSummary } from '@/lib/mic/types';

export function MicAttestationTable({ rows }: { rows: MicRewardAttestationSummary[] }) {
  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-950/70 p-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Recent reserve deposits</h3>
      <p className="mt-1 text-[10px] text-slate-600">
        Proxy for MIC_REWARD_V2 summaries from <span className="font-mono">vault:deposits</span> until ledger attestations are wired.
      </p>
      <div className="mt-2 max-h-48 overflow-y-auto">
        <table className="w-full text-left font-mono text-[10px] text-slate-300">
          <thead className="sticky top-0 bg-slate-950 text-slate-500">
            <tr>
              <th className="pb-1 pr-2">Source</th>
              <th className="pb-1 pr-2">Reserve Δ</th>
              <th className="pb-1">Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-2 text-slate-600">
                  No rows.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={`${row.nodeId}-${row.timestamp}`} className="border-t border-slate-800/80">
                  <td className="py-1 pr-2 align-top text-slate-400">{row.nodeId}</td>
                  <td className="py-1 pr-2 align-top text-cyan-100">{row.mic.toFixed(4)}</td>
                  <td className="py-1 align-top text-slate-500">{row.timestamp}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
