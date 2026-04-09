'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';

const CHAMBERS = [
  { label: 'Globe', href: '/terminal/globe', icon: '◎', shortcut: 'Alt+1' },
  { label: 'Pulse', href: '/terminal/pulse', icon: '∿', shortcut: 'Alt+2' },
  { label: 'Signals', href: '/terminal/signals', icon: '⊕', shortcut: 'Alt+3' },
  { label: 'Sentinel', href: '/terminal/sentinel', icon: '◉', shortcut: 'Alt+4' },
  { label: 'Ledger', href: '/terminal/ledger', icon: '⛓', shortcut: 'Alt+5' },
] as const;

const KEY_TO_ROUTE: Record<string, string> = {
  '1': '/terminal/globe',
  '2': '/terminal/pulse',
  '3': '/terminal/signals',
  '4': '/terminal/sentinel',
  '5': '/terminal/ledger',
};

export default function ChamberSwitcher() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;

      const route = KEY_TO_ROUTE[event.key];
      if (!route) return;
      event.preventDefault();
      router.push(route);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router]);

  return (
    <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Terminal chambers">
      {CHAMBERS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            title={tab.shortcut}
            className={cn(
              'whitespace-nowrap rounded border px-2 py-1 text-[11px] font-mono uppercase tracking-wide',
              active ? 'border-cyan-300/60 bg-cyan-400/10 text-cyan-100' : 'border-slate-700/80 bg-slate-900/50 text-slate-400',
            )}
          >
            <span className="mr-1">{tab.icon}</span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
