'use client';

import ChamberSkeleton from '@/components/terminal/ChamberSkeleton';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';

type Domain = { key: string; label: string; agent: string; score: number | null; sourceLabel?: string; trend?: string };

export default function SentimentPageClient() {
  const { snapshot, loading } = useTerminalSnapshot();
  if (loading && !snapshot) return <ChamberSkeleton blocks={6} />;

  const sentiment = (snapshot?.sentiment?.data ?? {}) as { overall_sentiment?: number | null; domains?: Domain[] };
  const overall = sentiment.overall_sentiment ?? null;

  const tone = (score: number | null) => (score === null ? 'border-slate-700' : score >= 0.8 ? 'border-emerald-500/40' : score >= 0.65 ? 'border-amber-500/40' : 'border-rose-500/40');

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-3 text-lg font-semibold">Overall sentiment: {overall === null ? '—' : overall.toFixed(2)}</div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(sentiment.domains ?? []).map((domain) => (
          <section key={domain.key} className={`rounded border bg-slate-900/60 p-4 ${tone(domain.score)}`}>
            <div className="text-sm font-semibold">{domain.label}</div>
            <div className="text-xs text-slate-400">{domain.agent}</div>
            <div className="mt-2 h-2 rounded bg-slate-800">
              <div className="h-2 rounded bg-cyan-400" style={{ width: `${Math.round((domain.score ?? 0) * 100)}%` }} />
            </div>
            <div className="mt-2 text-xs">score {domain.score === null ? '—' : domain.score.toFixed(2)} · {domain.sourceLabel ?? 'snapshot'}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
