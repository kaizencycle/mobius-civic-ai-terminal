'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const CHAMBERS = [
  { label: 'Globe', href: '/terminal/globe', icon: '◎' },
  { label: 'Pulse', href: '/terminal/pulse', icon: '∿' },
  { label: 'Signals', href: '/terminal/signals', icon: '⊕' },
  { label: 'Sentinel', href: '/terminal/sentinel', icon: '◉' },
  { label: 'Ledger', href: '/terminal/ledger', icon: '⛓' },
] as const;

type IntegrityStatus = { cycle?: string; global_integrity?: number };

export default function TerminalHeader() {
  const pathname = usePathname();
  const [integrity, setIntegrity] = useState<IntegrityStatus | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const next = await fetch('/api/integrity-status', { cache: 'no-store' })
        .then((r) => r.json() as Promise<IntegrityStatus>)
        .catch(() => null);
      if (mounted && next) setIntegrity(next);
    };
    void load();
    const id = window.setInterval(load, 60_000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  const gi = Number(integrity?.global_integrity ?? 0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;

      const routeMap: Record<string, string> = {
        '1': '/terminal/globe',
        '2': '/terminal/pulse',
        '3': '/terminal/signals',
        '4': '/terminal/sentinel',
        '5': '/terminal/ledger',
      };
      const route = routeMap[event.key];
      if (!route) return;
      event.preventDefault();
      window.location.assign(route);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded border border-cyan-400/60 bg-cyan-400/10 px-2 py-0.5 font-mono text-xs">⌘</div>
          <div className="text-sm font-semibold tracking-wide">MOBIUS CIVIC TERMINAL</div>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="rounded border border-cyan-500/50 bg-cyan-500/10 px-2 py-1 text-cyan-100">GI {gi.toFixed(2)}</span>
          <span className="rounded border border-slate-700 px-2 py-1">{integrity?.cycle ?? 'C-—'}</span>
        </div>
      </div>
      <nav className="flex gap-2 overflow-x-auto pb-1">
        {CHAMBERS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'whitespace-nowrap rounded border px-2 py-1 text-[11px] font-mono uppercase tracking-wide',
                active
                  ? 'border-cyan-300/60 bg-cyan-400/10 text-cyan-100'
                  : 'border-slate-700/80 bg-slate-900/50 text-slate-400',
              )}
            >
              <span className="mr-1">{tab.icon}</span>
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
