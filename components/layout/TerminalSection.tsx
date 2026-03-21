import type { ReactNode } from 'react';
import { cn } from '@/lib/terminal/utils';

export default function TerminalSection({
  id,
  eyebrow,
  title,
  description,
  children,
  actions,
  className,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn('rounded-2xl border border-slate-800 bg-slate-900/40 p-4', className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          {eyebrow ? (
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{eyebrow}</div>
          ) : null}
          <div className="mt-1 text-lg font-semibold text-white">{title}</div>
          {description ? <div className="mt-1 text-sm text-slate-400">{description}</div> : null}
        </div>
        {actions ? <div className="text-xs text-slate-500">{actions}</div> : null}
      </div>

      {children}
    </section>
  );
}
