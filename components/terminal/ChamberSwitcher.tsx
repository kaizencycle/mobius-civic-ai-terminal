'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';

const CHAMBERS = [
  { label: 'Globe', mobileLabel: 'Glb', href: '/terminal/globe', icon: '◎', shortcut: 'Alt/Ctrl/Cmd+1' },
  { label: 'Pulse', mobileLabel: 'Pls', href: '/terminal/pulse', icon: '∿', shortcut: 'Alt/Ctrl/Cmd+2' },
  { label: 'Signals', mobileLabel: 'Sig', href: '/terminal/signals', icon: '⊕', shortcut: 'Alt/Ctrl/Cmd+3' },
  { label: 'Sentinel', mobileLabel: 'Snt', href: '/terminal/sentinel', icon: '◉', shortcut: 'Alt/Ctrl/Cmd+4' },
  { label: 'Ledger', mobileLabel: 'Ldg', href: '/terminal/ledger', icon: '⛓', shortcut: 'Alt/Ctrl/Cmd+5' },
  { label: 'Journal', mobileLabel: 'Jrl', href: '/terminal/journal', icon: '✦', shortcut: 'Alt/Ctrl/Cmd+6' },
  { label: 'Vault', mobileLabel: 'Vlt', href: '/terminal/vault', icon: '◇', shortcut: 'Alt/Ctrl/Cmd+7' },
] as const;

const KEY_TO_ROUTE: Record<string, string> = {
  '1': '/terminal/globe',
  '2': '/terminal/pulse',
  '3': '/terminal/signals',
  '4': '/terminal/sentinel',
  '5': '/terminal/ledger',
  '6': '/terminal/journal',
  '7': '/terminal/vault',
};

export default function ChamberSwitcher() {
  const pathname = usePathname();
  const currentPath = pathname ?? '';
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey && !event.ctrlKey && !event.metaKey) return;
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
    <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5 md:mx-0 md:gap-2 md:px-0 md:pb-1" aria-label="Terminal chambers">
      {CHAMBERS.map((tab) => {
        const active = currentPath === tab.href || currentPath.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            title={tab.shortcut}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.12em] transition-all duration-150 md:rounded md:px-2.5 md:py-1 md:text-[11px] md:tracking-wide',
              active
                ? 'border-cyan-400/70 bg-cyan-500/15 text-cyan-50 shadow-[0_0_8px_rgba(34,211,238,0.12)]'
                : 'border-slate-700/80 bg-slate-900/50 text-slate-400 hover:border-slate-600 hover:bg-slate-800/60 hover:text-slate-200',
            )}
          >
            <span className="mr-1">{tab.icon}</span>
            <span className="md:hidden">{tab.mobileLabel}</span>
            <span className="hidden md:inline">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
