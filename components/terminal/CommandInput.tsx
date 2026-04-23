'use client';

import { useMemo, useState } from 'react';
import { commandRegistry } from '@/lib/commands/registry';
import type { TerminalCommandResult } from '@/lib/commands/types';

export default function CommandInput({
  onResult,
}: {
  onResult: (result: TerminalCommandResult) => void;
}) {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const normalizedInput = value.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!normalizedInput) return commandRegistry;
    return commandRegistry.filter((command) =>
      command.name.toLowerCase().includes(normalizedInput),
    );
  }, [normalizedInput]);

  const selectedSuggestion = suggestions[selectedIndex] ?? null;

  function applySuggestion(name: string) {
    setValue(name);
    setSelectedIndex(0);
  }

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
      setSelectedIndex(0);
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
      <div className="mt-1 text-[11px] text-slate-600">
        Shortcut: <kbd className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono">↑</kbd>/<kbd className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono">↓</kbd> to browse • <kbd className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono">Enter</kbd> to run
      </div>

      <div className="mt-3 flex gap-2 max-sm:flex-col">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (suggestions.length === 0) return;
              setSelectedIndex((prev) => (prev + 1) % suggestions.length);
              return;
            }

            if (e.key === 'ArrowUp') {
              e.preventDefault();
              if (suggestions.length === 0) return;
              setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
              return;
            }

            if (e.key === 'Tab' && selectedSuggestion) {
              e.preventDefault();
              applySuggestion(selectedSuggestion.name);
              return;
            }

            if (e.key === 'Enter') handleRun();
          }}
          placeholder="Try: substrate_status or open_lab oaa"
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
        <span>{normalizedInput ? 'Matches:' : 'Available:'}</span>
        {suggestions.length === 0 ? (
          <span className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-amber-300">
            No commands found
          </span>
        ) : suggestions.map((command, index) => (
          <button
            type="button"
            key={command.name}
            onClick={() => applySuggestion(command.name)}
            className={`cursor-pointer rounded-md border px-2 py-1 font-mono transition ${
              index === selectedIndex
                ? 'border-sky-500/40 bg-sky-500/10 text-sky-200'
                : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-300'
            }`}
          >
            <span>{command.name}</span>
            <span className="ml-2 hidden text-[10px] text-slate-500 md:inline">
              {command.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
