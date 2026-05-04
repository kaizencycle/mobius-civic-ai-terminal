/**
 * FreshnessBadge Component
 * Displays data freshness status with SLA-aware coloring
 */

import { useMemo } from 'react';

interface FreshnessBadgeProps {
  lastUpdate: number;
  slaMs?: number;
  compact?: boolean;
}

export function FreshnessBadge({ lastUpdate, slaMs = 900000, compact = false }: FreshnessBadgeProps) {
  const { age, status, colorClass, label } = useMemo(() => {
    const age = Date.now() - lastUpdate;
    const isCritical = age > slaMs * 2;
    const isStale = age > slaMs;
    
    let status: 'critical' | 'stale' | 'fresh' | 'live';
    let colorClass: string;
    let label: string;
    
    if (isCritical) {
      status = 'critical';
      colorClass = 'bg-red-500/20 text-red-300 border-red-500/30';
      label = '🔴 CRITICAL';
    } else if (isStale) {
      status = 'stale';
      colorClass = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      label = '🟡 STALE';
    } else if (age < 5 * 60 * 1000) {
      status = 'live';
      colorClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      label = '🟢 FRESH';
    } else {
      status = 'fresh';
      colorClass = 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
      label = '🔵 GOOD';
    }
    
    return { age, status, colorClass, label };
  }, [lastUpdate, slaMs]);

  const ageSeconds = Math.round(age / 1000);
  const ageDisplay = ageSeconds < 60 
    ? `${ageSeconds}s` 
    : ageSeconds < 3600 
      ? `${Math.round(ageSeconds / 60)}m` 
      : `${Math.round(ageSeconds / 3600)}h`;

  if (compact) {
    return (
      <span 
        className={`px-1.5 py-0.5 rounded text-xs font-mono border ${colorClass}`}
        title={`Last update: ${new Date(lastUpdate).toLocaleTimeString()}`}
      >
        {label.split(' ')[0]}
      </span>
    );
  }

  return (
    <span 
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono border ${colorClass}`}
      title={`Last update: ${new Date(lastUpdate).toLocaleTimeString()}`}
    >
      <span>{label}</span>
      {!['critical', 'stale'].includes(status) && (
        <span className="opacity-70">• {ageDisplay}</span>
      )}
    </span>
  );
}

export default FreshnessBadge;
