'use client';

import EventScreener, { type EpiconFeedItem } from '@/components/terminal/EventScreener';
import { useTerminalSnapshot } from '@/hooks/useTerminalSnapshot';

export default function PulsePage() {
  const { snapshot } = useTerminalSnapshot();
  const epicon = (snapshot?.epicon?.data ?? {}) as {
    items?: EpiconFeedItem[];
    summary?: Record<string, unknown>;
    sources?: { github: number; kv: number };
    total?: number;
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <EventScreener
        items={epicon.items}
        summary={epicon.summary ?? {}}
        sources={epicon.sources ?? { github: 0, kv: 0 }}
        total={epicon.total ?? 0}
      />
    </div>
  );
}
