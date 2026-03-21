'use client';

import type { IntegrityStatusResponse } from '@/lib/mock/integrityStatus';

type GIData = Pick<
  IntegrityStatusResponse,
  'cycle' | 'global_integrity' | 'mode' | 'terminal_status' | 'primary_driver' | 'summary' | 'timestamp'
> & {
  signals: Pick<IntegrityStatusResponse['signals'], 'quality' | 'freshness' | 'stability' | 'system'>;
};

function barWidth(value: number) {
  return `${Math.max(6, Math.round(value * 100))}%`;
}

export default function GIMonitorOverlay({
  data,
  onClose,
}: {
  data: GIData;
  onClose: () => void;
}) {
  return (
    <div className="absolute right-0 top-10 z-50 w-[360px] rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
            Global Integrity Monitor
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {(data.global_integrity * 100).toFixed(0)}%
          </div>
        </div>

        <button
          onClick={onClose}
          className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
        >
          Close
        </button>
      </div>

      <div className="mt-2 text-sm text-slate-400">
        Mode: <span className="text-white">{data.mode}</span>
      </div>
      <div className="mt-1 text-sm text-slate-400">
        Status: <span className="text-white">{data.terminal_status}</span>
      </div>
      <div className="mt-1 text-sm text-slate-400">
        Driver: <span className="text-white">{data.primary_driver}</span>
      </div>

      <div className="mt-4 space-y-3">
        {Object.entries(data.signals).map(([key, value]) => (
          <div key={key}>
            <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-[0.12em] text-slate-400">
              <span>{key}</span>
              <span>{value.toFixed(2)}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-800">
              <div
                className="h-2 rounded-full bg-sky-400"
                style={{ width: barWidth(value) }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">
        {data.summary}
      </div>

      <div className="mt-3 text-xs text-slate-500">
        {data.cycle} · Updated {new Date(data.timestamp).toLocaleString()}
      </div>
    </div>
  );
}
