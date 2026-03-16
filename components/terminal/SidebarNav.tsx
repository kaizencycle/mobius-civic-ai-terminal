'use client';

import { useState } from 'react';
import type { NavKey } from '@/lib/terminal/types';
import { cn } from '@/lib/terminal/utils';

const NAV_ICONS: Partial<Record<NavKey, string>> = {
  pulse: 'P',
  agents: 'A',
  ledger: 'L',
  markets: 'M',
  geopolitics: 'G',
  governance: 'V',
  reflections: 'R',
  infrastructure: 'I',
  search: 'S',
  settings: '⚙',
};

// Subset shown in the mobile bottom bar (most important chambers)
const MOBILE_NAV: NavKey[] = ['pulse', 'agents', 'ledger', 'markets', 'geopolitics', 'search'];

export default function SidebarNav({
  items,
  selected,
  onSelect,
}: {
  items: readonly { key: NavKey; label: string; badge?: number }[];
  selected: NavKey;
  onSelect: (key: NavKey) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);

  return (
    <>
      {/* ── Desktop / Tablet sidebar (hidden on mobile) ── */}
      <aside className={cn(
        'border-r border-slate-800 bg-slate-950/80 transition-all duration-200',
        'col-span-2 lg:col-span-2',
        'max-lg:col-span-1 max-lg:w-14',
        'max-md:hidden',
      )}>
        {/* Header — toggle on tablet */}
        <div className="border-b border-slate-800 px-4 py-3">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs font-mono uppercase tracking-[0.25em] text-slate-400 lg:cursor-default"
          >
            <span className="hidden lg:inline">Chambers</span>
            <span className="lg:hidden">☰</span>
          </button>
        </div>

        <nav className={cn(
          'p-3 lg:block',
          expanded ? 'max-lg:absolute max-lg:z-30 max-lg:left-0 max-lg:top-[105px] max-lg:w-48 max-lg:rounded-r-xl max-lg:border max-lg:border-slate-800 max-lg:bg-slate-950 max-lg:shadow-2xl' : '',
        )}>
          <div className="space-y-1">
            {items.map((item) => {
              const active = item.key === selected;
              return (
                <button
                  key={item.key}
                  onClick={() => {
                    onSelect(item.key);
                    setExpanded(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-sans transition',
                    active
                      ? 'bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/30'
                      : 'text-slate-300 hover:bg-slate-900 hover:text-white',
                  )}
                >
                  {/* Show icon-only on tablet when collapsed */}
                  <span className={cn(expanded ? '' : 'max-lg:hidden')}>{item.label}</span>
                  <span className={cn('lg:hidden font-mono text-xs', expanded ? 'hidden' : '')}>{NAV_ICONS[item.key] ?? '·'}</span>
                  {item.badge ? (
                    <span className={cn('rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-300', expanded ? '' : 'max-lg:hidden')}>
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </nav>
      </aside>

      {/* ── Mobile bottom tab bar (visible only on mobile) ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-slate-950/95 backdrop-blur safe-bottom">
        <div className="flex items-stretch">
          {MOBILE_NAV.map((key) => {
            const item = items.find((i) => i.key === key);
            if (!item) return null;
            const active = selected === key;
            return (
              <button
                key={key}
                onClick={() => { onSelect(key); setMobileExpanded(false); }}
                className={cn(
                  'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-mono uppercase tracking-wider transition min-h-[52px]',
                  active
                    ? 'text-sky-300 bg-sky-500/10'
                    : 'text-slate-400 active:bg-slate-900',
                )}
              >
                <span className="text-base leading-none">{NAV_ICONS[key]}</span>
                <span>{item.label.slice(0, 5)}</span>
              </button>
            );
          })}
          {/* More button — expands full nav */}
          <button
            onClick={() => setMobileExpanded((v) => !v)}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-mono uppercase tracking-wider transition min-h-[52px]',
              mobileExpanded ? 'text-sky-300 bg-sky-500/10' : 'text-slate-400 active:bg-slate-900',
            )}
          >
            <span className="text-base leading-none">···</span>
            <span>More</span>
          </button>
        </div>

        {/* Expanded mobile nav overlay */}
        {mobileExpanded && (
          <div className="border-t border-slate-800 bg-slate-950 p-3">
            <div className="grid grid-cols-4 gap-2">
              {items.filter((i) => !MOBILE_NAV.includes(i.key)).map((item) => {
                const active = selected === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => { onSelect(item.key); setMobileExpanded(false); }}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg p-2 text-[10px] font-mono uppercase tracking-wider transition min-h-[48px]',
                      active
                        ? 'text-sky-300 bg-sky-500/10 ring-1 ring-sky-500/30'
                        : 'text-slate-400 active:bg-slate-900',
                    )}
                  >
                    <span className="text-sm">{NAV_ICONS[item.key]}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </nav>
    </>
  );
}
