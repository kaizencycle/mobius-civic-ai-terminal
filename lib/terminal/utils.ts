import type { AgentStatus, EpiconStatus, Tripwire } from './types';

/** GI score color: >=0.85 emerald, >=0.70 amber, <0.70 red */
export function giScoreColor(score: number) {
  if (score >= 0.85) return { text: 'text-emerald-300', bg: 'bg-emerald-500', bar: 'bg-emerald-500', border: 'border-emerald-500/30', chip: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' };
  if (score >= 0.70) return { text: 'text-amber-300', bg: 'bg-amber-500', bar: 'bg-amber-500', border: 'border-amber-500/30', chip: 'text-amber-300 border-amber-500/30 bg-amber-500/10' };
  return { text: 'text-red-300', bg: 'bg-red-500', bar: 'bg-red-500', border: 'border-red-500/30', chip: 'text-red-300 border-red-500/30 bg-red-500/10' };
}

/** Per-metric bar color based on value */
export function metricBarColor(value: number) {
  if (value >= 0.85) return 'bg-emerald-500';
  if (value >= 0.70) return 'bg-amber-500';
  return 'bg-red-500';
}

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function statusColor(status: AgentStatus) {
  switch (status) {
    case 'idle':
      return 'bg-slate-500';
    case 'listening':
      return 'bg-cyan-500';
    case 'verifying':
      return 'bg-amber-500';
    case 'routing':
      return 'bg-rose-500';
    case 'analyzing':
      return 'bg-emerald-500';
    case 'alert':
      return 'bg-red-500';
    default:
      return 'bg-slate-500';
  }
}

export function epiconStatusStyle(status: EpiconStatus) {
  switch (status) {
    case 'verified':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'pending':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'contradicted':
      return 'bg-red-500/15 text-red-300 border-red-500/30';
    default:
      return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
  }
}

export function confidenceLabel(tier: number) {
  return ['T0', 'T1', 'T2', 'T3', 'T4'][tier] ?? 'T?';
}

export function tripwireStyle(severity: Tripwire['severity']) {
  switch (severity) {
    case 'low':
      return 'text-sky-300 border-sky-500/30 bg-sky-500/10';
    case 'medium':
      return 'text-amber-300 border-amber-500/30 bg-amber-500/10';
    case 'high':
      return 'text-red-300 border-red-500/30 bg-red-500/10';
    default:
      return 'text-slate-300 border-slate-500/30 bg-slate-500/10';
  }
}
