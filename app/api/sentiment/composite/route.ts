import { NextResponse } from 'next/server';
import { computeIntegrityPayload } from '@/lib/integrity/buildStatus';
import { pollAllMicroAgents } from '@/lib/agents/micro';
import type { MicroSignal } from '@/lib/agents/micro/core';
import {
  isRedisAvailable,
  kvGet,
  kvSet,
  loadSignalSnapshot,
  type SignalSnapshot,
} from '@/lib/kv/store';

type DomainKey = 'civic' | 'environ' | 'financial' | 'narrative' | 'infrastructure' | 'institutional';

type DomainPayload = {
  key: DomainKey;
  label: string;
  agent: string;
  score: number | null;
  sourceLabel: string;
};

type SentimentSnapshot = {
  cycle: string;
  timestamp: string;
  gi: number;
  overall_sentiment: number | null;
  domains: DomainPayload[];
  source: 'kv-signals' | 'live' | 'kv-composite-fallback';
  signals_timestamp?: string;
  signals_age_seconds?: number;
};

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'SENTIMENT_SNAPSHOT';

// Serve stale composite up to 2h; refresh cadence is driven by the signal
// sweep (`/api/signals/micro` + `/api/cron/gi-refresh`), not this endpoint.
const COMPOSITE_TTL_SECONDS = 2 * 60 * 60;

const DOMAIN_INSTRUMENTS: Record<DomainKey, string[]> = {
  environ: ['ATLAS-µ2', 'ATLAS-µ4', 'ATLAS-µ5', 'ECHO-µ2', 'ECHO-µ3'],
  civic: ['AUREA-µ1', 'AUREA-µ2', 'AUREA-µ3', 'EVE-µ2', 'EVE-µ3', 'EVE-µ4', 'EVE-µ5'],
  financial: ['ECHO-µ1', 'ZEUS-µ4', 'ATLAS-µ1'],
  narrative: ['HERMES-µ1', 'HERMES-µ3', 'HERMES-µ4', 'HERMES-µ5'],
  infrastructure: ['DAEDALUS-µ1', 'DAEDALUS-µ4', 'DAEDALUS-µ5'],
  institutional: ['ZEUS-µ1', 'ZEUS-µ2', 'ZEUS-µ5', 'JADE-µ3', 'JADE-µ5'],
};

const DOMAIN_META: Record<DomainKey, { label: string; agent: string }> = {
  civic: { label: 'CIVIC', agent: 'AUREA + EVE' },
  environ: { label: 'ENVIRON', agent: 'ATLAS + ECHO' },
  financial: { label: 'FINANCIAL', agent: 'ECHO + ZEUS + ATLAS' },
  narrative: { label: 'NARRATIVE', agent: 'HERMES' },
  infrastructure: { label: 'INFRASTR', agent: 'DAEDALUS' },
  institutional: { label: 'INSTITUTIONAL', agent: 'ZEUS + JADE' },
};

type AgentSignalInput = Pick<MicroSignal, 'agentName' | 'source' | 'value'>;

function mean(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (valid.length === 0) return null;
  return Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(3));
}

function scoreDomain(
  domainKey: DomainKey,
  signalsByAgent: Map<string, AgentSignalInput[]>,
): { score: number | null; sourceLabel: string } {
  const instrumentNames = DOMAIN_INSTRUMENTS[domainKey];
  const values: number[] = [];
  const sources: string[] = [];

  for (const name of instrumentNames) {
    const signals = signalsByAgent.get(name);
    if (!signals?.length) continue;
    for (const sig of signals) {
      if (typeof sig.value === 'number' && Number.isFinite(sig.value)) {
        values.push(sig.value);
        if (!sources.includes(sig.source)) sources.push(sig.source);
      }
    }
  }

  if (values.length === 0) {
    return { score: null, sourceLabel: `No live signals from ${instrumentNames.join(', ')}` };
  }

  const score = Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(3));
  return { score, sourceLabel: sources.join(' + ') };
}

function signalsByAgentFromSnapshot(snapshot: SignalSnapshot): Map<string, AgentSignalInput[]> {
  const map = new Map<string, AgentSignalInput[]>();
  for (const sig of snapshot.allSignals) {
    const list = map.get(sig.agentName);
    const entry: AgentSignalInput = { agentName: sig.agentName, source: sig.source, value: sig.value };
    if (list) list.push(entry);
    else map.set(sig.agentName, [entry]);
  }
  return map;
}

function buildDomainsFromAgents(signalsByAgent: Map<string, AgentSignalInput[]>): DomainPayload[] {
  return (['civic', 'environ', 'financial', 'narrative', 'infrastructure', 'institutional'] as DomainKey[]).map(
    (key) => {
      const { score, sourceLabel } = scoreDomain(key, signalsByAgent);
      const meta = DOMAIN_META[key];
      return { key, label: meta.label, agent: meta.agent, score, sourceLabel };
    },
  );
}

function ageSeconds(ts: string | undefined): number | undefined {
  if (!ts) return undefined;
  const ms = new Date(ts).getTime();
  if (!Number.isFinite(ms)) return undefined;
  return Math.max(0, Math.floor((Date.now() - ms) / 1000));
}

/**
 * C-283 — KV-first composite sentiment.
 *
 * Previously this endpoint called `pollAllMicroAgents()` on every request, a
 * fan-out over ~40 external APIs that routinely exceeded the snapshot
 * aggregator's 5 s lane budget (see ATLAS audit). The fan-out still happens —
 * but only inside the signal sweep (`/api/signals/micro`, `/api/cron/*`),
 * which writes `SIGNAL_SNAPSHOT` to KV.
 *
 * This handler now:
 *   1. Reads `SIGNAL_SNAPSHOT` from KV (fast, single HTTP GET).
 *   2. Computes domain composites from the cached signals.
 *   3. Pulls integrity from KV via `computeIntegrityPayload` (also KV-first).
 *   4. Caches the composite result under `SENTIMENT_SNAPSHOT` for observability.
 *   5. Only polls live micro-agents when KV has no signal snapshot at all
 *      (cold boot / KV outage) — never on the hot path.
 *
 * The freshness indicator (`signals_age_seconds`) makes staleness explicit;
 * `snapshotLanes.normalizeSentimentLane` already flags >10 min as `stale`.
 */
export async function GET() {
  try {
    const [integrity, signalSnapshot] = await Promise.all([
      computeIntegrityPayload(),
      isRedisAvailable() ? loadSignalSnapshot() : Promise.resolve(null),
    ]);

    if (signalSnapshot && Array.isArray(signalSnapshot.allSignals) && signalSnapshot.allSignals.length > 0) {
      const signalsByAgent = signalsByAgentFromSnapshot(signalSnapshot);
      const domains = buildDomainsFromAgents(signalsByAgent);
      const weightedOverall = mean(domains.map((d) => d.score));

      const payload: SentimentSnapshot = {
        cycle: integrity.cycle,
        timestamp: new Date().toISOString(),
        gi: integrity.global_integrity,
        overall_sentiment: weightedOverall,
        domains,
        source: 'kv-signals',
        signals_timestamp: signalSnapshot.timestamp,
        signals_age_seconds: ageSeconds(signalSnapshot.timestamp),
      };

      if (isRedisAvailable()) {
        kvSet(CACHE_KEY, payload, COMPOSITE_TTL_SECONDS).catch(() => {});
      }

      return NextResponse.json(
        { ok: true, ...payload },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
            'X-Mobius-Source': 'sentiment-composite-kv-signals',
          },
        },
      );
    }

    // No signal snapshot in KV — either the sweep hasn't run yet or KV is
    // offline. Fall back to live polling so the terminal still gets data,
    // but mark the source explicitly so operators see it.
    const micro = await pollAllMicroAgents();
    const signalsByAgent = new Map<string, AgentSignalInput[]>();
    for (const agent of micro.agents) {
      signalsByAgent.set(
        agent.agentName,
        agent.signals.map((s) => ({ agentName: s.agentName, source: s.source, value: s.value })),
      );
    }
    const domains = buildDomainsFromAgents(signalsByAgent);
    const weightedOverall = mean(domains.map((d) => d.score));

    const payload: SentimentSnapshot = {
      cycle: integrity.cycle,
      timestamp: new Date().toISOString(),
      gi: integrity.global_integrity,
      overall_sentiment: weightedOverall,
      domains,
      source: 'live',
    };

    if (isRedisAvailable()) {
      kvSet(CACHE_KEY, payload, COMPOSITE_TTL_SECONDS).catch(() => {});
    }

    return NextResponse.json(
      { ok: true, ...payload },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
          'X-Mobius-Source': 'sentiment-composite-live',
        },
      },
    );
  } catch {
    if (isRedisAvailable()) {
      const snapshot = await kvGet<SentimentSnapshot>(CACHE_KEY);
      if (snapshot) {
        return NextResponse.json(
          { ok: true, cached: true, ...snapshot, source: 'kv-composite-fallback' },
          { headers: { 'X-Mobius-Source': 'sentiment-composite-kv-fallback' } },
        );
      }
    }

    return NextResponse.json({ ok: false, error: 'Sentiment composite unavailable' }, { status: 500 });
  }
}
