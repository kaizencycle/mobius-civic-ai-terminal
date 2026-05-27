'use client';

import { useState } from 'react';

type ReverifyState = 'idle' | 'pending' | 'ok' | 'error';

export function ZeusReverifyButton() {
  const [state, setState] = useState<ReverifyState>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function handleReverify() {
    setState('pending');
    setMessage(null);
    try {
      const res = await fetch('/api/sentinel/zeus-reverify', { method: 'POST' });
      const body = await res.json().catch(() => ({})) as { ok?: boolean; cycle?: string; error?: string };
      if (!res.ok || !body.ok) {
        setState('error');
        setMessage(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setState('ok');
      setMessage(`ZEUS reverification dispatched · ${body.cycle ?? ''}`);
    } catch {
      setState('error');
      setMessage('Network error — ZEUS reverify unreachable.');
    }
  }

  const label =
    state === 'pending' ? 'Dispatching…' :
    state === 'ok'      ? 'Dispatched ✓' :
    'Run ZEUS Reverify';

  const cls =
    state === 'ok'    ? 'border-green-500/40 text-green-300 hover:border-green-400' :
    state === 'error' ? 'border-rose-500/40 text-rose-300 hover:border-rose-400' :
    'border-cyan-500/40 text-cyan-300 hover:border-cyan-400';

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleReverify}
        disabled={state === 'pending'}
        className={`rounded border px-3 py-1 font-mono text-xs transition-colors disabled:opacity-50 ${cls}`}
      >
        {label}
      </button>
      {message && (
        <div className={`text-[10px] font-mono ${state === 'ok' ? 'text-green-400' : 'text-rose-400'}`}>
          {message}
        </div>
      )}
    </div>
  );
}
