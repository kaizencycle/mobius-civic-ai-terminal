import type { MicroAgentSweepResult } from '@/lib/agents/micro';
import type { EpiconItem } from '@/lib/terminal/types';
import type { SentimentDomainKey } from '@/lib/terminal/globePins';
import type { GlobeDashboardBundle } from '@/components/terminal/chambers/globeDashboardExtras';

export type MicroSweepResponse = MicroAgentSweepResult & { ok?: boolean };

export type SentimentDomain = {
  key: SentimentDomainKey;
  label: string;
  agent: string;
  score: number | null;
  status: 'nominal' | 'stressed' | 'critical' | 'unknown';
};

export type GlobeChamberProps = {
  micro: MicroSweepResponse | null;
  echoEpicon: EpiconItem[];
  domains: SentimentDomain[];
  cycleId: string;
  clockLabel: string;
  giScore: number;
  miiScore: number | null;
  /** Extra snapshot lanes for Globe chapter dashboards (same fetch as globe). */
  globeDashboard?: GlobeDashboardBundle | null;
};
