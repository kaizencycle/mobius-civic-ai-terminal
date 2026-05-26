'use client';

import type { EpiconEvent, ConfidenceTier } from '@/lib/terminal/epicon';

const TIER_BAR: Record<ConfidenceTier, { pct: number; color: string }> = {
  VERIFIED:     { pct: 85, color: 'bg-green-500' },
  PENDING:      { pct: 55, color: 'bg-amber-500' },
  CONTRADICTED: { pct: 25, color: 'bg-red-500' },
  ARCHIVED:     { pct: 30, color: 'bg-zinc-500' },
};

interface Props {
  event: EpiconEvent;
  onClose: () => void;
}

export function EpiconInspector({ event, onClose }: Props) {
  const bar = TIER_BAR[event.tier];
  const confColor =
    event.confidence >= 0.80 ? 'text-green-400' :
    event.confidence >= 0.60 ? 'text-amber-400' :
    'text-red-400';

  return (
    <div className="w-80 border-l border-zinc-800 bg-zinc-950 flex flex-col font-mono text-xs overflow-y-auto flex-shrink-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <span className="text-fuchsia-400 font-bold">INSPECTOR</span>
        <button type="button" onClick={onClose} className="text-zinc-600 hover:text-zinc-300 transition-colors">✕</button>
      </div>
      <div className="px-4 py-3 space-y-4">
        <div className="flex gap-4">
          <div>
            <div className="text-zinc-600 text-[10px] uppercase tracking-widest">Event</div>
            <div className="text-zinc-300">{event.id.toUpperCase()}</div>
          </div>
          <div>
            <div className="text-zinc-600 text-[10px] uppercase tracking-widest">Cycle</div>
            <div className="text-amber-400">{event.cycle}</div>
          </div>
        </div>

        <div>
          <div className="text-zinc-600 text-[10px] uppercase tracking-widest mb-1">Summary</div>
          <div className="text-zinc-200 leading-relaxed">{event.summary}</div>
        </div>

        <div>
          <div className="text-zinc-600 text-[10px] uppercase tracking-widest mb-2">Confidence Ladder</div>
          <div className="flex items-center gap-2 mb-1">
            <div className="flex-1 bg-zinc-800 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full ${bar.color} transition-all`}
                style={{ width: `${bar.pct}%` }}
              />
            </div>
            <span className={`font-bold ${confColor}`}>
              {(event.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <div className="text-zinc-600">{event.tier}</div>
        </div>

        <div>
          <div className="text-zinc-600 text-[10px] uppercase tracking-widest mb-2">Source Stack</div>
          <ol className="space-y-1">
            {event.sources.map((src, i) => (
              <li key={src} className="flex gap-2 text-zinc-400">
                <span className="text-zinc-700">{i + 1}.</span>
                <span className="text-sky-400">{src}</span>
              </li>
            ))}
          </ol>
        </div>

        {event.contradictions?.length ? (
          <div className="border border-red-800/50 bg-red-950/20 rounded p-3">
            <div className="text-red-400 text-[10px] uppercase tracking-widest mb-2">Contradictions</div>
            {event.contradictions.map((c) => (
              <div key={c} className="text-red-300 flex gap-2">
                <span className="text-red-700">✕</span>
                <span>{c}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div>
          <div className="text-zinc-600 text-[10px] uppercase tracking-widest mb-1">Attested By</div>
          <div className="text-sky-400">{event.agent}</div>
        </div>
      </div>
    </div>
  );
}
