'use client';

import { useEffect, useState } from 'react';
import { useMobiusIdentity } from '@/hooks/useMobiusIdentity';
import CandidateCard from './CandidateCard';

type Candidate = {
  id: string;
  title: string;
  summary: string;
  category: string;
  status: 'pending' | 'verified' | 'contradicted' | 'pending-verification';
  confidence_tier: number;
  external_source_system?: string;
  zeus_note?: string;
  source?: string;
};

export default function CandidateFeed() {
  const [data, setData] = useState<Candidate[]>([]);
  const { hasPermission } = useMobiusIdentity();

  async function load() {
    const res = await fetch('/api/epicon/candidates', { cache: 'no-store' });
    const json = await res.json();
    const raw = (json.candidates || []) as Array<
      Candidate & { confidenceTier?: number }
    >;
    setData(
      raw.map((c) => ({
        ...c,
        confidence_tier:
          typeof c.confidence_tier === 'number'
            ? c.confidence_tier
            : typeof c.confidenceTier === 'number'
              ? c.confidenceTier
              : 0,
      })),
    );
  }

  async function onVerify(id: string, outcome: 'verified' | 'contradicted') {
    const res = await fetch('/api/epicon/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        outcome,
        confidence_tier: outcome === 'verified' ? 2 : 0,
        zeus_note:
          outcome === 'verified'
            ? 'Cross-source alignment sufficient for verified candidate status.'
            : 'Contradiction or insufficient support detected by ZEUS.',
        reviewer: 'kaizencycle',
      }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => null);
      console.error(json?.error || 'ZEUS verification failed');
      return;
    }

    await load();
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-3">
      {data.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-800 bg-black/20 p-4 text-sm text-slate-400">
          External candidate lane empty. Trigger adapter ingest to populate pending EPICON candidates.
        </div>
      ) : null}

      {data.map((item) => (
        <CandidateCard
          key={item.id}
          item={item}
          onVerify={onVerify}
          canVerify={hasPermission('epicon:verify')}
          canContradict={hasPermission('epicon:contradict')}
          pipelineManaged={item.source === 'eve-synthesis'}
        />
      ))}
    </div>
  );
}
