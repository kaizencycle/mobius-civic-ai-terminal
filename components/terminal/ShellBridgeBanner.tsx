'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const SHELL_URL = 'https://mobius-browser-shell.vercel.app';

const SHELL_CONTEXT: Record<string, { label: string; detail: string }> = {
  oaa: { label: 'OAA Learning Hub', detail: 'Your learning activity feeds agent signals here.' },
  reflections: { label: 'Reflections Lab', detail: 'Civic reflections are tracked in the Ledger chamber.' },
  shield: { label: 'Citizen Shield', detail: 'Shield integrity feeds into the Global Integrity score.' },
  hive: { label: 'HIVE', detail: 'Game state is observable in the Sentinel chamber.' },
  wallet: { label: 'Wallet', detail: 'MIC balance and shards are visible in the Vault chamber.' },
};

export default function ShellBridgeBanner() {
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [fromLab, setFromLab] = useState<string | null>(null);

  useEffect(() => {
    const from = searchParams?.get('from');
    if (from !== 'shell') return;

    setVisible(true);
    setFromLab(searchParams?.get('lab') ?? null);

    const url = new URL(window.location.href);
    url.searchParams.delete('from');
    url.searchParams.delete('lab');
    window.history.replaceState({}, '', url.pathname + url.search);
  }, [searchParams]);

  if (!visible) return null;

  const ctx = fromLab ? SHELL_CONTEXT[fromLab] : null;

  return (
    <div className="border-b border-violet-500/30 bg-violet-950/30 px-3 py-2.5 md:px-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-violet-200">
            <span className="rounded border border-violet-500/40 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider">
              Shell Bridge
            </span>
            <span>
              {ctx
                ? `Arrived from ${ctx.label}`
                : 'Connected from Mobius Browser Shell'}
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-violet-300/80">
            {ctx?.detail ?? 'Welcome to the operator Terminal. This is the read/interact surface for Mobius Substrate — live integrity, agent status, and ledger data.'}
            {' '}
            <a
              href={SHELL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-violet-400 underline decoration-violet-500/40 hover:text-violet-300"
            >
              Return to Shell
            </a>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="shrink-0 rounded border border-violet-600/30 px-1.5 py-0.5 text-[9px] font-mono text-violet-400 hover:bg-violet-900/30 hover:text-violet-200"
          aria-label="Dismiss bridge banner"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
