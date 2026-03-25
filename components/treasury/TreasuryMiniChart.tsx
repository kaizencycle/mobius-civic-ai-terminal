'use client';

export type TreasuryChartPoint = {
  date: string;
  timestamp: string;
  value: number;
};

function formatCompact(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${Math.round(value)}`;
}

export default function TreasuryMiniChart({
  points,
  label = '30d trend',
}: {
  points: TreasuryChartPoint[];
  label?: string;
}) {
  if (!points || points.length < 2) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-500">
        Treasury history pending
      </div>
    );
  }

  const width = 320;
  const height = 96;
  const paddingX = 10;
  const paddingY = 10;

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);

  const coords = points.map((point, index) => {
    const x = paddingX + (index / (points.length - 1)) * (width - paddingX * 2);
    const y = height - paddingY - ((point.value - min) / span) * (height - paddingY * 2);
    return { x, y, ...point };
  });

  const polyline = coords.map((c) => `${c.x},${c.y}`).join(' ');
  const latest = points[points.length - 1];
  const earliest = points[0];
  const delta = latest.value - earliest.value;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{label}</div>
        <div className="text-[11px] font-mono text-slate-400">Δ {formatCompact(delta)}</div>
      </div>

      <div className="mt-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full overflow-visible" preserveAspectRatio="none">
          <line
            x1={paddingX}
            y1={height - paddingY}
            x2={width - paddingX}
            y2={height - paddingY}
            className="stroke-slate-800"
            strokeWidth="1"
          />
          <polyline
            fill="none"
            points={polyline}
            className="stroke-sky-400"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {coords.length > 0 ? <circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r="3" className="fill-sky-300" /> : null}
        </svg>
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.12em] text-slate-500">
        <span>{earliest.date}</span>
        <span>{latest.date}</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
        <span>{formatCompact(min)}</span>
        <span>{formatCompact(max)}</span>
      </div>
    </div>
  );
}
