import type { NavKey } from '@/lib/terminal/types';
import { cn } from '@/lib/terminal/utils';

export default function SidebarNav({
  items,
  selected,
  onSelect,
}: {
  items: readonly { key: NavKey; label: string; badge?: number }[];
  selected: NavKey;
  onSelect: (key: NavKey) => void;
}) {
  return (
    <aside className="col-span-2 border-r border-slate-800 bg-slate-950/80">
      <div className="border-b border-slate-800 px-4 py-3">
        <div className="text-xs font-mono uppercase tracking-[0.25em] text-slate-400">
          Chambers
        </div>
      </div>

      <nav className="p-3">
        <div className="space-y-1">
          {items.map((item) => {
            const active = item.key === selected;
            return (
              <button
                key={item.key}
                onClick={() => onSelect(item.key)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-sans transition',
                  active
                    ? 'bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/30'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white',
                )}
              >
                <span>{item.label}</span>
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
  );
}
