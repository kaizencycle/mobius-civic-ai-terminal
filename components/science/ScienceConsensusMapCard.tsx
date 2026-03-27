import { scienceConsensusDomains } from '@/lib/science/mock';

function tone(value: string) {
  if (value === 'verified' || value === 'translated' || value === 'framed') return 'text-emerald-300';
  if (value === 'watch') return 'text-amber-300';
  return 'text-slate-400';
}

export default function ScienceConsensusMapCard() {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Consensus Map</div>
      <div className="mt-1 text-sm text-slate-300">ZEUS verifies, JADE translates, AUREA frames.</div>

      <div className="mt-4 space-y-3">
        {scienceConsensusDomains.map((item) => (
          <div key={item.domain} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
            <div className="text-sm font-medium text-white">{item.domain}</div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] uppercase tracking-[0.12em]">
              <div className={tone(item.zeus)}>ZEUS · {item.zeus}</div>
              <div className={tone(item.jade)}>JADE · {item.jade}</div>
              <div className={tone(item.aurea)}>AUREA · {item.aurea}</div>
            </div>
            <div className="mt-2 text-xs text-slate-400">{item.note}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
