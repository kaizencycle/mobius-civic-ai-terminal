import Link from 'next/link';
import TerminalSection from '@/components/layout/TerminalSection';
import ScienceChamberOverviewCard from '@/components/science/ScienceChamberOverviewCard';
import ScienceConsensusMapCard from '@/components/science/ScienceConsensusMapCard';
import FrontierWatchCard from '@/components/science/FrontierWatchCard';
import JadeScienceTranslationCard from '@/components/science/JadeScienceTranslationCard';
import CivicScienceBriefCard from '@/components/science/CivicScienceBriefCard';
import { scienceRecords } from '@/lib/science/mock';

function confidenceTone(confidence: 'high' | 'medium' | 'low') {
  switch (confidence) {
    case 'high':
      return 'text-emerald-300';
    case 'medium':
      return 'text-amber-300';
    default:
      return 'text-slate-400';
  }
}

export default function SciencePage() {
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Mobius Terminal</div>
          <h1 className="mt-1 text-2xl font-semibold text-white">Science Chamber · C-262</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Standalone science chamber foundation for canonical timestamps, civic translation, frontier watch,
            and first-pass consensus mapping.
          </p>
        </div>
        <Link
          href="/terminal"
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs uppercase tracking-[0.12em] text-slate-300"
        >
          Return to Terminal
        </Link>
      </div>

      <div className="mx-auto mt-6 grid w-full max-w-7xl gap-4">
        <TerminalSection
          eyebrow="Foundation Route"
          title="Science-native Mobius surface"
          description="This standalone route ships the first science chamber package before deeper terminal nav wiring."
        >
          <div className="grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">Canonical timestamps preserved.</div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">JADE civic translation active.</div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">ZEUS + AUREA science framing scaffolded.</div>
          </div>
        </TerminalSection>

        <div className="grid gap-4 xl:grid-cols-2">
          <ScienceChamberOverviewCard />
          <ScienceConsensusMapCard />
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <FrontierWatchCard />
          <JadeScienceTranslationCard />
          <CivicScienceBriefCard />
        </div>

        <TerminalSection
          eyebrow="Canonical Science Records"
          title="Seed records"
          description="Newest-first science records prepared for later EPICON and ledger integration."
        >
          <div className="space-y-3">
            {scienceRecords.map((record) => (
              <div key={`${record.timestamp}-${record.title}`} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-white">{record.title}</div>
                  <div className={`text-[10px] uppercase tracking-[0.12em] ${confidenceTone(record.confidence)}`}>
                    {record.confidence}
                  </div>
                </div>
                <div className="mt-2 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                  {record.timestamp} · {record.source}
                </div>
                <div className="mt-2 text-xs text-slate-400">{record.summary}</div>
              </div>
            ))}
          </div>
        </TerminalSection>
      </div>
    </div>
  );
}
