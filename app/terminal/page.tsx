'use client';

import GlobeChamber from '@/components/terminal/chambers/GlobeChamber';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';
import type { MicroAgentSweepResult } from '@/lib/agents/micro';
import type { EpiconItem } from '@/lib/terminal/types';

export default function TerminalPage() {
  const { snapshot } = useTerminalSnapshot();
  const integrity = (snapshot?.integrity?.data ?? {}) as { cycle?: string; global_integrity?: number };
  const micro = (snapshot?.signals?.data ?? null) as MicroAgentSweepResult | null;
  const echo = (snapshot?.epicon?.data ?? {}) as { items?: EpiconItem[] };
  const sentiment = (snapshot?.sentiment?.data ?? {}) as {
    domains?: Array<{ key: 'civic' | 'environ' | 'financial' | 'narrative' | 'infrastructure' | 'institutional'; label: string; agent: string; score: number | null }>;
  };

  const domains = (sentiment.domains ?? []).map((d) => ({
    ...d,
    status: (d.score === null ? 'unknown' : d.score >= 0.8 ? 'nominal' : d.score >= 0.6 ? 'stressed' : 'critical') as
      | 'nominal'
      | 'stressed'
      | 'critical'
      | 'unknown',
  }));

  return (
    <GlobeChamber
      micro={micro}
      echoEpicon={echo.items ?? []}
      domains={domains}
      cycleId={integrity.cycle ?? 'C-271'}
      clockLabel={new Date().toISOString().slice(11, 16) + ' UTC'}
      giScore={Number(integrity.global_integrity ?? 0)}
      miiScore={null}
    />
  );
}
