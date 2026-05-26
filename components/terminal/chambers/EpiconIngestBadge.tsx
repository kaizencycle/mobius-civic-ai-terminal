'use client';

import type { EpiconEvent } from '@/lib/terminal/epicon';

interface Props {
  count: number;
  events: EpiconEvent[];
}

export function EpiconIngestBadge({ count, events }: Props) {
  const newest = events.reduce((max, ev) => (ev.ts > max ? ev.ts : max), 0);
  const ageSec = Math.floor((Date.now() - newest) / 1000);
  const ageStr =
    ageSec < 60   ? `${ageSec}s` :
    ageSec < 3600 ? `${Math.floor(ageSec / 60)}m` :
                    `${Math.floor(ageSec / 3600)}h`;
  const fresh = ageSec < 300;

  return (
    <div className="flex items-center gap-3 ml-auto text-[10px]">
      <div className="flex items-center gap-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full transition-colors ${
            count % 2 === 0 ? 'bg-fuchsia-400' : 'bg-fuchsia-700'
          }`}
        />
        <span className="text-zinc-500">
          INGEST <span className="text-fuchsia-400">{count}</span>
        </span>
      </div>
      <div className={`px-2 py-0.5 rounded border ${
        fresh
          ? 'bg-green-950 border-green-800 text-green-300'
          : 'bg-amber-950 border-amber-800 text-amber-300'
      }`}>
        LAST {ageStr} · {fresh ? 'FRESH' : 'STALE'}
      </div>
    </div>
  );
}
