'use client';

const CYCLE_HISTORY = [
  { cycle: 'C-313', count: 3, gi: 0.68 },
  { cycle: 'C-314', count: 1, gi: 0.74 },
  { cycle: 'C-315', count: 2, gi: 0.71 },
  { cycle: 'C-316', count: 0, gi: 0.82 },
  { cycle: 'C-317', count: 1, gi: 0.79 },
  { cycle: 'C-318', count: 4, gi: 0.64 },
  { cycle: 'C-319', count: 2, gi: 0.70 },
  { cycle: 'C-320', count: 5, gi: 0.66 },
  { cycle: 'C-321', count: 1, gi: 0.91 },
  { cycle: 'C-322', count: 2, gi: 0.80 },
  { cycle: 'C-323', count: 2, gi: null },
] as const;

const MAX_COUNT = Math.max(...CYCLE_HISTORY.map((c) => c.count), 1);
const BAR_H = 48;

export function TripwireSparkline() {
  return (
    <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-950/60">
      <div className="text-zinc-500 text-[10px] mb-2 tracking-widest uppercase">
        Anomaly Frequency · Last 10 Cycles
      </div>
      <div className="flex items-end gap-1 h-12">
        {CYCLE_HISTORY.map(({ cycle, count, gi }) => {
          const h = count === 0 ? 2 : Math.round((count / MAX_COUNT) * BAR_H);
          const color =
            gi === null ? 'bg-zinc-600' :
            gi < 0.65   ? 'bg-red-500' :
            gi < 0.75   ? 'bg-amber-500' :
                          'bg-green-500';
          return (
            <div key={cycle} className="flex flex-col items-center gap-0.5 flex-1 group">
              <div
                className={`w-full rounded-sm ${color} opacity-80 group-hover:opacity-100 transition-opacity`}
                style={{ height: `${h}px` }}
                title={`${cycle} · ${count} anomalies · GI ${gi ?? '—'}`}
              />
              <span className="text-zinc-600 text-[8px] group-hover:text-zinc-400 transition-colors">
                {cycle.replace('C-', '')}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-3 mt-2 text-[10px] text-zinc-600">
        <span><span className="inline-block w-2 h-2 bg-green-500 rounded-sm mr-1 align-middle" />GI ≥ 0.75</span>
        <span><span className="inline-block w-2 h-2 bg-amber-500 rounded-sm mr-1 align-middle" />GI 0.65–0.74</span>
        <span><span className="inline-block w-2 h-2 bg-red-500 rounded-sm mr-1 align-middle" />GI &lt; 0.65</span>
      </div>
    </div>
  );
}
