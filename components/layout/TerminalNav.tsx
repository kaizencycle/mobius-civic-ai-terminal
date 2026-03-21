'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/terminal/utils';

const navItems = [
  { label: 'Terminal', href: '/terminal', match: '/terminal' },
  { label: 'EPICON', href: '/epicon', match: '/epicon' },
  { label: 'Agents', href: '/terminal#agents', match: '/terminal' },
  { label: 'MIC', href: '/terminal#mic', match: '/terminal' },
  { label: 'Profile', href: '/profile', match: '/profile' },
] as const;

export default function TerminalNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Terminal navigation" className="flex flex-wrap items-center gap-2">
      {navItems.map((item) => {
        const active = pathname === item.match;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'rounded-lg border px-3 py-2 text-[11px] font-mono uppercase tracking-[0.18em] transition',
              active
                ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
                : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-600 hover:bg-slate-800 hover:text-white',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
