'use client';

import type { MicReadinessResponse } from '@/lib/mic/types';

export function SealStatusCard({
  sustain,
  replay,
  novelty,
}: {
  sustain: MicReadinessResponse['sustain'];
  replay: MicReadinessResponse['replay'];
  novelty: MicReadinessResponse['novelty'];
}) {
  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-950/70 p-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Seal / integrity window</h3>
      <div className="mt-2 space-y-1 font-mono text-[11px] text-slate-300">
        <div>
          Sustain: {sustain.consecutiveEligibleCycles} / {sustain.requiredCycles}{' '}
          <span className="text-slate-500">({sustain.status})</span>
        </div>
        {sustain.sustain_tracking_placeholder ? (
          <div className="text-amber-200/80">Sustain: not tracked in KV yet (placeholder)</div>
        ) : null}
        <div>
          Replay: <span className="text-slate-200">{replay.status}</span> · pressure {replay.replayPressure.toFixed(3)}
        </div>
        <div>
          Novelty: <span className="text-slate-200">{novelty.status}</span> · score {novelty.noveltyScore.toFixed(3)}{' '}
          <span className="text-slate-600">(avg journal_score window)</span>
        </div>
      </div>
    </div>
  );
}
