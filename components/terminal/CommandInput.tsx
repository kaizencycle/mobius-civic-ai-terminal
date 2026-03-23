'use client';

import { useState } from 'react';
import { commandRegistry } from '@/lib/commands/registry';
import type { TerminalCommandResult } from '@/lib/commands/types';

export default function CommandInput({
  onResult,
}: {
  onResult: (result: TerminalCommandResult) => void;
}) {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRun() {
    if (!value.trim()) return;

    try {
      setLoading(true);

      const res = await fetch('/api/terminal/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: value }),
      });

      const json = await res.json();
      onResult(json.result);
      setValue('');
    } catch {
      onResult({
        command: value,
        ok: false,
        title: 'Command Failure',
        error: 'Unable to execute command.',
        timestamp: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
        Command Interface
      </div>

      <div className="mt-3 flex gap-2 max-sm:flex-col">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRun();
          }}
          placeholder="Enter command: weekly_digest"
          className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
        />

        <button
          onClick={handleRun}
          disabled={loading}
          className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-300 transition hover:bg-sky-500/20 disabled:opacity-50"
        >
          {loading ? 'Running...' : 'Run'}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
        <span>Available:</span>
        {commandRegistry.map((command) => (
          <span
            key={command.name}
            className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-slate-400"
          >
            {command.name}
          </span>
        ))}
      </div>
    </div>
  );
}
