'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { WalletProvider } from '@/contexts/WalletContext';
import CommandSurface from '@/components/terminal/CommandSurface';
import { cn } from '@/lib/utils';

type IntegrityStatus = {
  cycle?: string;
  global_integrity?: number;
};

const NAV = [
  { label: 'Globe', href: '/terminal' },
  { label: 'Pulse', href: '/terminal/pulse' },
  { label: 'Signals', href: '/terminal/signals' },
  { label: 'Sentinel', href: '/terminal/sentinel' },
  { label: 'Ledger', href: '/terminal/ledger' },
  { label: 'Tripwire', href: '/terminal/tripwire' },
  { label: 'Sentiment', href: '/terminal/sentiment' },
  { label: 'MIC', href: '/terminal/mic' },
  { label: 'Journal', href: '/terminal/journal' },
] as const;

export default function TerminalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [integrity, setIntegrity] = useState<IntegrityStatus | null>(null);
  const [kvHealth, setKvHealth] = useState<'healthy' | 'degraded'>('degraded');
  const [heartbeat, setHeartbeat] = useState<string>('—');

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [giRes, kvRes] = await Promise.allSettled([
        fetch('/api/integrity-status', { cache: 'no-store' }).then((r) => r.json() as Promise<IntegrityStatus>),
        fetch('/api/kv/health', { cache: 'no-store' }).then((r) => r.json() as Promise<{ ok?: boolean }>),
      ]);
      if (!alive) return;
      if (giRes.status === 'fulfilled') {
        setIntegrity(giRes.value);
        setHeartbeat(new Date().toISOString());
      }
      if (kvRes.status === 'fulfilled') setKvHealth(kvRes.value.ok ? 'healthy' : 'degraded');
    };
    void load();
    const id = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const gi = Number(integrity?.global_integrity ?? 0);
  const giTone = gi >= 0.85 ? 'text-emerald-300 border-emerald-500/40' : gi >= 0.7 ? 'text-amber-300 border-amber-500/40' : 'text-rose-300 border-rose-500/40';

  const runtimeLabel = useMemo(() => (gi >= 0.85 ? 'nominal' : gi >= 0.7 ? 'guarded' : 'critical'), [gi]);

  return (
    <WalletProvider>
      <div className="flex min-h-screen flex-col bg-[#020617] text-slate-100">
        <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded border border-cyan-400/60 bg-cyan-400/10 px-2 py-0.5 font-mono text-xs">⌘</div>
              <div className="text-sm font-semibold tracking-wide">MOBIUS CIVIC TERMINAL</div>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className={cn('rounded border px-2 py-1', giTone)}>GI {gi.toFixed(2)}</span>
              <span className="rounded border border-slate-700 px-2 py-1">{integrity?.cycle ?? 'C-—'}</span>
            </div>
          </div>
          <nav className="flex gap-2 overflow-x-auto pb-1">
            {NAV.map((tab) => {
              const active = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    'whitespace-nowrap rounded border px-2 py-1 text-[11px] font-mono uppercase tracking-wide',
                    active ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-100' : 'border-slate-700 text-slate-400 hover:text-slate-200',
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="flex-1 overflow-hidden pb-28">{children}</main>

        <div className="fixed bottom-14 left-0 right-0 z-30 border-t border-slate-800 bg-slate-950/95 px-4 py-1 text-[10px] font-mono uppercase tracking-wide text-slate-400">
          Runtime {runtimeLabel} · KV {kvHealth} · Last heartbeat {heartbeat === '—' ? '—' : new Date(heartbeat).toISOString()}
        </div>

        <CommandSurface />
      </div>
    </WalletProvider>
  );
}
