import { frontierWatchItems } from '@/lib/science/mock';

function laneTone(lane: string) {
  switch (lane) {
    case 'space':
      return 'text-sky-300';
    case 'earth':
      return 'text-emerald-300';
    case 'climate':
      return 'text-cyan-300';
    case 'biotech':
      return 'text-fuchsia-300';
    case 'compute':
      return 'text-amber-300';
    default:
      return 'text-slate-300';
  }
}

export default function FrontierWatchCard() {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Frontier Watch</div>
      <div className="mt-1 text-sm text-slate-300">Priority surfaces for future science routing.</div>

      <div className="mt-4 space-y-3">
        {frontierWatchItems.map((item) => (
          <div key={item.title} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-white">{item.title}</div>
              <div className={`text-[10px] uppercase tracking-[0.12em] ${laneTone(item.lane)}`}>{item.lane} · {item.status}</div>
            </div>
            <div className="mt-2 text-xs text-slate-400">{item.summary}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
