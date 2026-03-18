import { useState, useCallback } from 'react';
import type { CommandResult } from '@/lib/terminal/types';
import SectionLabel from './SectionLabel';

export default function CommandPalette({
  onExecute,
}: {
  onExecute: (command: string) => CommandResult;
}) {
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<
    { input: string; result: CommandResult }[]
  >([]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = value.trim();
      if (!trimmed) return;

      if (trimmed === '/clear') {
        setHistory([]);
        setValue('');
        return;
      }

      const result = onExecute(trimmed);
      setHistory((prev) => [...prev.slice(-4), { input: trimmed, result }]);
      setValue('');
    },
    [value, onExecute],
  );

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <SectionLabel
        title="Command Palette"
        subtitle="Keyboard-first substrate access"
      />

      {history.length > 0 && (
        <div className="mt-3 max-h-32 overflow-y-auto space-y-1">
          {history.map((h, i) => (
            <div key={i} className="flex gap-2 text-xs font-mono">
              <span className="text-slate-500">$</span>
              <span className="text-slate-300">{h.input}</span>
              <span className="text-slate-500">&rarr;</span>
              <span
                className={h.result.ok ? 'text-emerald-300' : 'text-amber-300'}
              >
                {h.result.message}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 rounded-lg border border-dashed border-slate-800 bg-slate-950/50 px-3 py-2 text-[11px] font-mono uppercase tracking-[0.12em] text-slate-500">
        Suggested: /submit · /scan tripwire · /ledger · /wallet · /echo
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-3 flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2"
      >
        <span className="text-sm font-mono text-slate-500">$</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Try /scan, /agents, /tripwires, /gi, /help"
          className="w-full bg-transparent text-sm font-mono text-white outline-none placeholder:text-slate-500"
        />
        <button
          type="submit"
          className="shrink-0 rounded-md border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-mono text-slate-300 hover:bg-slate-700 transition"
        >
          Run
        </button>
      </form>
    </section>
  );
}
