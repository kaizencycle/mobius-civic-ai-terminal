import { chamberMeta } from '../layout';

export const metadata = chamberMeta(
  'Markets',
  'Real-time market signals — equity indices, energy, commodities, and macro indicators.',
  'markets'
);

export default function MarketsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 px-4 text-center">
      <div className="font-mono text-2xl text-slate-600">◈</div>
      <h1 className="font-mono text-sm uppercase tracking-widest text-slate-500">Markets</h1>
      <p className="text-xs text-slate-600 max-w-sm">
        Real-time market signals chamber — coming online. Finviz signals available via{' '}
        <span className="text-slate-400 font-mono">/api/markets/finviz/signals</span>.
      </p>
    </div>
  );
}
