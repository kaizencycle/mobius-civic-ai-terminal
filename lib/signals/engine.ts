import { fetchAllSources } from '@/lib/echo/sources';
import { transformBatch } from '@/lib/echo/transform';
import { getEchoEpicon, pushIngestResult } from '@/lib/echo/store';
import { integrityStatus } from '@/lib/mock/integrityStatus';
import { integrityStatusToGISnapshot } from '@/lib/terminal/api';
import { mockAgents, mockEpicon, mockTripwires } from '@/lib/terminal/mock';
import { detectTripwires, mergeTripwires } from '@/lib/echo/tripwire-engine';
import { setTripwireState, type RuntimeTripwireState } from '@/lib/tripwire/store';

export type PulseSignal = {
  id: string;
  source_agent: string;
  category: string;
  title: string;
  summary: string;
  status: 'pending';
  confidence_tier: number;
  observed_at: string;
  tags: string[];
};

function normalizeSignals() {
  const epicon = getEchoEpicon();
  const items = epicon.length > 0 ? epicon : mockEpicon;

  return items.slice(0, 8).map<PulseSignal>((item) => ({
    id: item.id,
    source_agent: item.ownerAgent,
    category: item.category,
    title: item.title,
    summary: item.summary,
    status: 'pending',
    confidence_tier: item.confidenceTier,
    observed_at: item.timestamp,
    tags: item.sources.slice(0, 3),
  }));
}

function evaluateRuntimeTripwire(): RuntimeTripwireState {
  const epicon = getEchoEpicon();
  const items = epicon.length > 0 ? epicon : mockEpicon;
  const gi = integrityStatusToGISnapshot(integrityStatus);
  const autoTripwires = detectTripwires({
    epicon: items,
    gi,
    agents: mockAgents,
    tripwires: mockTripwires,
  });
  const merged = mergeTripwires(mockTripwires, autoTripwires);

  let level: RuntimeTripwireState['level'] = 'none';
  let active = false;
  let reason = 'No active tripwires - baseline state';

  const high = merged.find((tripwire) => tripwire.severity === 'high');
  const medium = merged.find((tripwire) => tripwire.severity === 'medium');

  if (high) {
    active = true;
    level = 'elevated';
    reason = `${high.label} — ${high.action}`;
  } else if (medium) {
    active = true;
    level = 'watch';
    reason = `${medium.label} — ${medium.action}`;
  }

  const state = {
    active,
    level,
    reason,
    last_updated: new Date().toISOString(),
  };

  setTripwireState(state);
  return state;
}

export async function runSignalEngine(): Promise<{
  signals: PulseSignal[];
  tripwire: RuntimeTripwireState;
}> {
  try {
    const rawEvents = await fetchAllSources();
    if (rawEvents.length > 0) {
      const result = transformBatch(rawEvents);
      pushIngestResult(result);
    }
  } catch {
    // Keep the last known in-memory signal state if upstream sources fail.
  }

  return {
    signals: normalizeSignals(),
    tripwire: evaluateRuntimeTripwire(),
  };
}
