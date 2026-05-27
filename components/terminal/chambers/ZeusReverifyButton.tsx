'use client';

import { useState } from 'react';

type ReverifyState = 'idle' | 'pending' | 'ok' | 'error' | 'auth';

export function ZeusReverifyButton() {
  const [state, setState] = useState<ReverifyState>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function handleReverify() {
    setState('pending');
    setMessage(null);
    try {
      const res = await fetch('/api/agents/zeus/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'operator-ui' }),
      });
      if (res.status === 401 || res.status === 403) {
        setState('auth');
        setMessage('Auth required — set ZEUS_VERIFY_TOKEN in Vercel env vars.');
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setState('error');
        setMessage(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setState('ok');
      setMessage('ZEUS reverification dispatched — check journal for result.');
    } catch {
      setState('error');
      setMessage('Network error — ZEUS verify unreachable.');
    }
  }

  const label =
    state === 'pending' ? 'Dispatching…' :
    state === 'ok'      ? 'Dispatched ✓' :
    'Run ZEUS Reverify';

  const cls =
    state === 'ok'    ? 'border-green-500/40 text-green-300 hover:border-green-400' :
    state === 'error' ? 'border-rose-500/40 text-rose-300 hover:border-rose-400' :
    state === 'auth'  ? 'border-amber-500/40 text-amber-300 hover:border-amber-400' :
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
        <div className={`text-[10px] font-mono ${
          state === 'ok' ? 'text-green-400' :
          state === 'auth' ? 'text-amber-400' : 'text-rose-400'
        }`}>
          {message}
        </div>
      )}
    </div>
  );
}
