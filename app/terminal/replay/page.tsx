'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

// unchanged types omitted for brevity

export default function ReplayPage() {
  const [plan, setPlan] = useState<any>(null);
  const [dryRun, setDryRun] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    void fetch('/api/system/replay/plan', { cache: 'no-store' })
      .then(async (r) => {
        const payload = await r.json();
        if (!r.ok || !payload.ok) throw new Error('replay_plan_failed');
        setPlan(payload);
      })
      .catch(() => setErr('Unable to load replay plan'));
  }, []);

  const active = dryRun ?? plan;

  const confidencePct = useMemo(() => {
    const raw = active?.rebuild?.confidence ?? 0;
    return Math.max(0, Math.min(100, Math.round(raw * 100)));
  }, [active]);

  const sortedSources = useMemo(() => {
    if (!active?.sources) return [];
    return [...active.sources].sort((a, b) => a.layer - b.layer);
  }, [active]);

  if (err && !active) return <div className="p-4 text-sm text-rose-300">{err}</div>;
  if (!active) return <div className="p-4 text-sm text-slate-400">Loading replay inspector…</div>;

  return (
    <div className="h-full overflow-y-auto p-4 font-mono text-xs text-slate-200">
      {/* header unchanged */}

      <div className="h-2 overflow-hidden rounded bg-slate-800">
        <div className="h-full rounded bg-violet-400 transition-all duration-500" style={{ width: `${confidencePct}%` }} />
      </div>

      <div className="space-y-2">
        {sortedSources.map((src) => (
          <div key={src.id}>{src.label}</div>
        ))}
      </div>
    </div>
  );
}
