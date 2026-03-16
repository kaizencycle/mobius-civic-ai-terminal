'use client';

import { cn } from '@/lib/terminal/utils';

export type SortOption<K extends string = string> = {
  key: K;
  label: string;
};

export default function SortBar<K extends string>({
  options,
  active,
  direction,
  onSort,
}: {
  options: SortOption<K>[];
  active: K;
  direction: 'asc' | 'desc';
  onSort: (key: K, direction: 'asc' | 'desc') => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-slate-500 mr-1">
        Sort
      </span>
      {options.map((opt) => {
        const isActive = opt.key === active;
        return (
          <button
            key={opt.key}
            onClick={() => {
              if (isActive) {
                onSort(opt.key, direction === 'asc' ? 'desc' : 'asc');
              } else {
                onSort(opt.key, 'desc');
              }
            }}
            className={cn(
              'rounded-md border px-2 py-1 text-[10px] font-mono uppercase tracking-[0.1em] transition',
              isActive
                ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
                : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-300 hover:border-slate-700',
            )}
          >
            {opt.label}
            {isActive && (
              <span className="ml-1">{direction === 'desc' ? '↓' : '↑'}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
