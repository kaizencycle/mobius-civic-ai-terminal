'use client';

/**
 * IntegrityMonitorCard — Radial GI gauge with animated arcs.
 *
 * Replaces flat progress bars with a radial gauge that makes the
 * system feel alive. The core pulse speeds up as GI degrades,
 * sub-metrics render as concentric arcs, and the weekly trend is
 * shown as a lightweight SVG sparkline.
 */

import { useEffect, useMemo, useState } from 'react';
import type { GISnapshot } from '@/lib/terminal/types';
import { cn, giScoreColor } from '@/lib/terminal/utils';
import SectionLabel from './SectionLabel';

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function sparklinePath(points: number[], width: number, height: number) {
  if (points.length < 2) return '';

  const min = Math.min(...points) - 0.02;
  const max = Math.max(...points) + 0.02;
  const range = max - min || 1;
  const step = width / (points.length - 1);

  return points
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

function MetricLabel({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5">
        <span className={cn('h-1.5 w-1.5 rounded-full', color)} />
        <span className="text-[11px] font-mono text-slate-400">{label}</span>
      </div>
      <span className="text-[11px] font-mono text-slate-300">{Math.round(value * 100)}%</span>
    </div>
  );
}

export default function IntegrityMonitorCard({
  gi,
  onClick,
}: {
  gi: GISnapshot;
  onClick?: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const colors = giScoreColor(gi.score);
  const cx = 80;
  const cy = 80;
  const arcStart = -135;
  const arcEnd = 135;
  const arcRange = arcEnd - arcStart;

  const giAngle = arcStart + gi.score * arcRange;
  const trustAngle = arcStart + gi.institutionalTrust * arcRange;
  const reliabilityAngle = arcStart + gi.infoReliability * arcRange;
  const consensusAngle = arcStart + gi.consensusStability * arcRange;

  const giArc = describeArc(cx, cy, 62, arcStart, mounted ? giAngle : arcStart);
  const bgArc = describeArc(cx, cy, 62, arcStart, arcEnd);
  const trustArc = describeArc(cx, cy, 52, arcStart, mounted ? trustAngle : arcStart);
  const reliabilityArc = describeArc(cx, cy, 44, arcStart, mounted ? reliabilityAngle : arcStart);
  const consensusArc = describeArc(cx, cy, 36, arcStart, mounted ? consensusAngle : arcStart);

  const zone = colors.bar === 'bg-emerald-500' ? 'healthy' : colors.bar === 'bg-amber-500' ? 'watch' : 'critical';
  const mainStroke = zone === 'healthy' ? 'rgb(52 211 153)' : zone === 'watch' ? 'rgb(251 191 36)' : 'rgb(248 113 113)';
  const coreRingStroke = zone === 'healthy' ? 'rgb(16 185 129 / 0.3)' : zone === 'watch' ? 'rgb(245 158 11 / 0.3)' : 'rgb(239 68 68 / 0.3)';
  const pulseSpeed = gi.score >= 0.85 ? '3s' : gi.score >= 0.7 ? '1.8s' : '0.9s';

  const sparkW = 120;
  const sparkH = 32;
  const spark = useMemo(() => sparklinePath(gi.weekly, sparkW, sparkH), [gi.weekly]);
  const sparkFill = zone === 'healthy' ? 'rgb(52 211 153)' : zone === 'watch' ? 'rgb(251 191 36)' : 'rgb(248 113 113)';
  const sparkStroke = sparkFill;
  const sparkDot = sparkFill;

  const lastPoint = useMemo(() => {
    if (gi.weekly.length < 2) return null;

    const min = Math.min(...gi.weekly) - 0.02;
    const max = Math.max(...gi.weekly) + 0.02;
    const range = max - min || 1;
    const x = sparkW - 1;
    const y = sparkH - ((gi.weekly[gi.weekly.length - 1] - min) / range) * sparkH;

    return { x, y };
  }, [gi.weekly]);

  return (
    <button
      onClick={onClick}
      className="group w-full rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-left transition hover:border-slate-700 hover:bg-slate-900/80"
    >
      <SectionLabel
        title="GI Monitor"
        subtitle={gi.summary ?? `Civic integrity signal${gi.mode ? ` · ${gi.mode.toUpperCase()}` : ''}`}
      />

      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="relative shrink-0 self-center sm:self-start" style={{ width: 160, height: 160 }}>
          <svg viewBox="0 0 160 160" className="h-full w-full">
            <defs>
              <filter id="gi-glow">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <path d={bgArc} fill="none" stroke="rgb(30 41 59 / 0.8)" strokeWidth="8" strokeLinecap="round" />
            <path d={describeArc(cx, cy, 52, arcStart, arcEnd)} fill="none" stroke="rgb(30 41 59 / 0.4)" strokeWidth="4" strokeLinecap="round" />
            <path d={describeArc(cx, cy, 44, arcStart, arcEnd)} fill="none" stroke="rgb(30 41 59 / 0.3)" strokeWidth="3" strokeLinecap="round" />
            <path d={describeArc(cx, cy, 36, arcStart, arcEnd)} fill="none" stroke="rgb(30 41 59 / 0.2)" strokeWidth="2.5" strokeLinecap="round" />

            <path d={trustArc} fill="none" stroke="rgb(56 189 248 / 0.6)" strokeWidth="4" strokeLinecap="round" className="transition-all duration-1000 ease-out" />
            <path d={reliabilityArc} fill="none" stroke="rgb(168 85 247 / 0.6)" strokeWidth="3" strokeLinecap="round" className="transition-all duration-1000 ease-out" />
            <path d={consensusArc} fill="none" stroke="rgb(251 191 36 / 0.5)" strokeWidth="2.5" strokeLinecap="round" className="transition-all duration-1000 ease-out" />
            <path d={giArc} fill="none" stroke={mainStroke} strokeWidth="8" strokeLinecap="round" className="transition-all duration-1000 ease-out" />

            <circle cx={cx} cy={cy} r="22" fill="rgb(15 23 42 / 0.9)" />
            <circle cx={cx} cy={cy} r="18" fill="none" stroke={coreRingStroke} strokeWidth="1" filter="url(#gi-glow)">
              <animate attributeName="opacity" values="0.3;0.8;0.3" dur={pulseSpeed} repeatCount="indefinite" />
              <animate attributeName="r" values="18;20;18" dur={pulseSpeed} repeatCount="indefinite" />
            </circle>

            <text x={cx} y={cy - 2} textAnchor="middle" className="fill-white font-mono font-bold" fontSize="18">
              {gi.score.toFixed(2)}
            </text>
            <text x={cx} y={cy + 12} textAnchor="middle" className="fill-slate-500 font-mono uppercase" fontSize="7" letterSpacing="0.12em">
              GI SCORE
            </text>
            <text
              x={cx}
              y="148"
              textAnchor="middle"
              className={cn(
                'font-mono',
                gi.delta > 0 ? 'fill-emerald-400' : gi.delta < 0 ? 'fill-red-400' : 'fill-slate-500',
              )}
              fontSize="10"
            >
              {gi.delta > 0 ? `▲ +${gi.delta.toFixed(2)}` : gi.delta < 0 ? `▼ ${gi.delta.toFixed(2)}` : `${gi.delta.toFixed(2)}`}
            </text>
          </svg>
        </div>

        <div className="min-w-0 flex-1 pt-1">
          <div className="space-y-2">
            <MetricLabel label="Signal Quality" value={gi.signalBreakdown?.quality ?? gi.institutionalTrust} color="bg-sky-400" />
            <MetricLabel label="Signal Freshness" value={gi.signalBreakdown?.freshness ?? gi.infoReliability} color="bg-violet-400" />
            <MetricLabel label="Tripwire Stability" value={gi.signalBreakdown?.stability ?? gi.consensusStability} color="bg-amber-400" />
            <MetricLabel label="System Health" value={gi.signalBreakdown?.system ?? gi.score} color="bg-emerald-400" />
          </div>

          <div className="mt-4 rounded-lg border border-slate-800/60 bg-slate-950/50 p-2">
            <div className="mb-1.5 text-[10px] font-mono uppercase tracking-[0.15em] text-slate-600">7-day trend</div>
            <svg viewBox={`0 0 ${sparkW} ${sparkH}`} className="h-8 w-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={sparkFill} stopOpacity="0.25" />
                  <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                </linearGradient>
              </defs>
              {spark && (
                <>
                  <path d={`${spark} L ${sparkW} ${sparkH} L 0 ${sparkH} Z`} fill="url(#spark-grad)" />
                  <path d={spark} fill="none" stroke={sparkStroke} strokeWidth="1.5" strokeLinejoin="round" className="transition-all duration-700" />
                </>
              )}
              {lastPoint && <circle cx={lastPoint.x} cy={lastPoint.y} r="2.5" fill={sparkDot} />}
            </svg>
          </div>
        </div>
      </div>
    </button>
  );
}
