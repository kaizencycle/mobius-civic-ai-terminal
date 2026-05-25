export interface JournalStats {
  total: number;
  agentCount: number;
  currentCycle: string;
  canonCount: number;
}

export function JournalHeader({ stats }: { stats: JournalStats }) {
  const cells = [
    { label: 'Total entries', value: stats.total },
    { label: 'Active agents', value: stats.agentCount },
    { label: 'Current cycle', value: stats.currentCycle },
    { label: 'Canon entries', value: stats.canonCount },
  ] as const;

  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cells.map(({ label, value }) => (
        <div
          key={label}
          className="rounded-lg border border-slate-800/80 bg-slate-900/50 p-2.5 dark:border-slate-700 dark:bg-slate-900/70"
        >
          <div className="text-base font-medium text-slate-100">{value}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">{label}</div>
        </div>
      ))}
    </div>
  );
}
