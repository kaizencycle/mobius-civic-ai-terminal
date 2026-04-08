'use client';

import SentimentMap from '@/components/terminal/SentimentMap';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';

export default function SentimentPage() {
  const { snapshot } = useTerminalSnapshot();
  const sentiment = (snapshot?.sentiment?.data ?? {}) as {
    cycle?: string;
    timestamp?: string;
    gi?: number;
    overall_sentiment?: number | null;
    domains?: Array<{ key: 'civic' | 'environ' | 'financial' | 'narrative' | 'infrastructure' | 'institutional'; label: string; agent: string; score: number | null; sourceLabel: string }>;
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <SentimentMap
        cycleId={sentiment.cycle ?? 'C-271'}
        timestamp={sentiment.timestamp ?? new Date().toISOString()}
        sentimentTimestamp={sentiment.timestamp ?? null}
        gi={sentiment.gi ?? 0}
        overallSentiment={sentiment.overall_sentiment ?? null}
        domains={(sentiment.domains ?? []).map((domain) => ({ ...domain, trend: 'flat', status: 'unknown' }))}
        history={{}}
        journalEntries={[]}
        onAskAgent={() => undefined}
      />
    </div>
  );
}
