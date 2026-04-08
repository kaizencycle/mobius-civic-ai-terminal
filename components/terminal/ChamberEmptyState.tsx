'use client';

type ChamberEmptyStateProps = {
  title: string;
  reason: string;
  action?: string;
  actionDetail?: string;
};

export default function ChamberEmptyState({
  title,
  reason,
  action,
  actionDetail,
}: ChamberEmptyStateProps) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-5">
      <h2 className="text-base font-semibold text-slate-200">{title}</h2>
      <p className="mt-2 text-sm text-slate-400">{reason}</p>
      {action ? <p className="mt-4 text-xs font-mono text-cyan-200">{action}</p> : null}
      {actionDetail ? <p className="mt-1 text-xs text-slate-500">{actionDetail}</p> : null}
    </div>
  );
}
