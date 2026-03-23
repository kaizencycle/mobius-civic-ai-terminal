'use client';

import type { TerminalCommandResult } from '@/lib/commands/types';

export default function CommandResult({
  result,
}: {
  result: TerminalCommandResult | null;
}) {
  if (!result) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-slate-400">
        No command executed yet.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
        Command Result
      </div>

      <div className="mt-2 text-lg font-semibold text-white">{result.title}</div>

      {result.summary ? (
        <div className="mt-2 text-sm text-slate-300">{result.summary}</div>
      ) : null}

      {result.error ? (
        <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">
          {result.error}
        </div>
      ) : null}

      {result.data ? (
        <pre className="mt-4 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-300">
          {JSON.stringify(result.data, null, 2)}
        </pre>
      ) : null}

      <div className="mt-3 text-xs text-slate-500">
        {new Date(result.timestamp).toLocaleString()}
      </div>
    </div>
  );
}
