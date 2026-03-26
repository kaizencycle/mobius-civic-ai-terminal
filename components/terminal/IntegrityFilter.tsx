'use client';

import { useState } from 'react';

export default function IntegrityFilter({
  onFilterChange,
  defaultThreshold = 0.7,
}: {
  onFilterChange: (val: number) => void;
  defaultThreshold?: number;
}) {
  const [threshold, setThreshold] = useState(defaultThreshold);

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
      <span className="text-xs font-mono uppercase tracking-[0.18em] text-emerald-300">
        Noise Suppression: {Math.round(threshold * 100)}%
      </span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={threshold}
        onChange={(e) => {
          const val = Number.parseFloat(e.target.value);
          setThreshold(val);
          onFilterChange(val);
        }}
        className="h-1 w-40 cursor-pointer appearance-none rounded-lg bg-slate-700 accent-emerald-400"
      />
      <div
        className={`rounded border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.16em] ${threshold > 0.8 ? 'border-sky-500 text-sky-300' : 'border-slate-700 text-slate-300'}`}
      >
        {threshold > 0.8 ? 'Ultra-Pure Signal' : 'Standard Audit'}
      </div>
    </div>
  );
}
