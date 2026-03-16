'use client';

import { useState } from 'react';
import type { NavKey } from '@/lib/terminal/types';
import { cn } from '@/lib/terminal/utils';

const NAV_ICONS: Partial<Record<NavKey, string>> = {
  pulse: 'P',
  agents: 'A',
  ledger: 'L',
  wallet: 'W',
  markets: 'M',
  geopolitics: 'G',
  governance: 'V',
  reflections: 'R',
  infrastructure: 'I',
  search: 'S',
  settings: '⚙',
};

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
  const [mobileOpen, setMobileOpen] = useState(false);

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

      {/* ── Mobile: hamburger toggle button (fixed top-left) ── */}
      <button
        onClick={() => setMobileOpen((v) => !v)}
        className={cn(
          'md:hidden fixed top-3 left-3 z-50 flex items-center justify-center rounded-lg border px-2.5 py-2 text-sm font-mono transition-all',
          mobileOpen
            ? 'border-sky-500/40 bg-sky-500/20 text-sky-300'
            : 'border-slate-700 bg-slate-900/95 text-slate-300 backdrop-blur',
        )}
        aria-label="Toggle navigation"
      >
        {mobileOpen ? '✕' : '☰'}
      </button>

      {/* ── Mobile: backdrop ── */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Mobile: left slide-out sidebar drawer ── */}
      <aside
        className={cn(
          'md:hidden fixed top-0 left-0 bottom-0 z-40 w-56 border-r border-slate-800 bg-slate-950 transition-transform duration-300',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Drawer header */}
        <div className="border-b border-slate-800 px-4 py-3 pt-14">
          <div className="text-xs font-mono uppercase tracking-[0.25em] text-slate-400">
            Chambers
          </div>
        </div>

        {/* Nav items */}
        <nav className="p-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 60px)' }}>
          <div className="space-y-1">
            {items.map((item) => {
              const active = item.key === selected;
              return (
                <button
                  key={item.key}
                  onClick={() => {
                    onSelect(item.key);
                    setMobileOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm font-sans transition min-h-[44px]',
                    active
                      ? 'bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/30'
                      : 'text-slate-300 active:bg-slate-900',
                  )}
                >
                  <span className="w-5 text-center text-xs font-mono text-slate-500">
                    {NAV_ICONS[item.key] ?? '·'}
                  </span>
                  <span className="flex-1">{item.label}</span>
                  {item.badge ? (
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-300">
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </nav>
      </aside>
    </>
  );
}
