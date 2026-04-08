'use client';

import { useState } from 'react';
import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';

type Tripwire = { id: string; label: string; severity?: 'high' | 'medium' | 'low'; ownerAgent?: string; openedAt?: string; actionDescription?: string; status?: 'resolved' | 'open' };

export default function TripwirePageClient() {
  const { snapshot, loading } = useTerminalSnapshot();
  const [showResolved, setShowResolved] = useState(false);
  if (loading && !snapshot) return <ChamberSkeleton blocks={6} />;

  const tripwires = ((snapshot?.runtime?.data as { tripwires?: Tripwire[] } | undefined)?.tripwires ??
    (snapshot?.integrity?.data as { tripwires?: Tripwire[] } | undefined)?.tripwires ??
    []) as Tripwire[];
  const active = tripwires.filter((t) => t.status !== 'resolved');
  const resolved = tripwires.filter((t) => t.status === 'resolved');

  const tone = (severity?: string) => (severity === 'high' ? 'border-rose-500/40 text-rose-200' : severity === 'medium' ? 'border-amber-500/40 text-amber-200' : 'border-slate-700 text-slate-300');

  return (
    <div className="h-full overflow-y-auto p-4">
      <h1 className="mb-3 text-lg font-semibold">Tripwire anomalies</h1>
      <div className="space-y-2">
        {active.map((wire) => (
          <article key={wire.id} className={`rounded border bg-slate-900/60 p-3 ${tone(wire.severity)}`}>
            <div className="text-sm">{wire.label}</div>
            <div className="text-xs">{wire.severity ?? 'low'} · owner {wire.ownerAgent ?? '—'} · opened {wire.openedAt ?? '—'}</div>
            <div className="mt-1 text-xs text-slate-400">{wire.actionDescription ?? 'No action text.'}</div>
          </article>
        ))}
      </div>
      <button onClick={() => setShowResolved((v) => !v)} className="mt-4 rounded border border-slate-700 px-2 py-1 text-xs">
        {showResolved ? 'Hide' : 'Show'} resolved ({resolved.length})
      </button>
      {showResolved ? (
        <div className="mt-3 space-y-2">
          {resolved.map((wire) => <div key={wire.id} className="rounded border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">{wire.label}</div>)}
        </div>
      ) : null}
    </div>
  );
}
