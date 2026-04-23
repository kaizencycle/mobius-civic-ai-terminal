import type { DataSource } from '@/lib/response-envelope';

type Props = {
  source: DataSource;
  freshAt: string | null;
  degraded: boolean;
};

function minutesAgo(freshAt: string | null): string {
  if (!freshAt) return 'unknown';
  const ms = Date.now() - new Date(freshAt).getTime();
  const minutes = Math.max(0, Math.floor(ms / 60000));
  return `${minutes}m ago`;
}

export default function DataSourceBadge({ source, freshAt, degraded }: Props) {
  if (source === 'live') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em] text-sky-300">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
        LIVE
      </span>
    );
  }

  if (source === 'stale-cache') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em] text-amber-300">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        CACHED · {minutesAgo(freshAt)}
      </span>
    );
  }

  if (source === 'github-commit') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-sky-300/30 bg-sky-300/10 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em] text-sky-300">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />
        VIA GITHUB
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em] ${
        degraded
          ? 'border-slate-500 bg-slate-500/10 text-slate-300'
          : 'border-slate-600 bg-slate-900 text-slate-400'
      }`}
    >
      MOCK DATA
    </span>
  );
}
