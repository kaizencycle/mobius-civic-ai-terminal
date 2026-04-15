import { NextResponse } from 'next/server';
import { computeIntegrityPayload } from '@/lib/integrity/buildStatus';
import { pollAllMicroAgents } from '@/lib/agents/micro';
import type { MicroSignal } from '@/lib/agents/micro/core';
import { isRedisAvailable, kvGet, kvSet } from '@/lib/kv/store';

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
};

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'SENTIMENT_SNAPSHOT';

function mean(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (valid.length === 0) return null;
  return Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(3));
}

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

function scoreDomain(
  domainKey: DomainKey,
  signalsByAgent: Map<string, MicroSignal[]>,
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

export async function GET() {
  try {
    const [integrity, micro] = await Promise.all([
      computeIntegrityPayload(),
      pollAllMicroAgents(),
    ]);

    const signalsByAgent = new Map<string, MicroSignal[]>();
    for (const agent of micro.agents) {
      signalsByAgent.set(agent.agentName, agent.signals);
    }

    const domains: DomainPayload[] = (['civic', 'environ', 'financial', 'narrative', 'infrastructure', 'institutional'] as DomainKey[]).map(
      (key) => {
        const { score, sourceLabel } = scoreDomain(key, signalsByAgent);
        const meta = DOMAIN_META[key];
        return { key, label: meta.label, agent: meta.agent, score, sourceLabel };
      },
    );

    const weightedOverall = mean(domains.map((d) => d.score));

    const payload: SentimentSnapshot = {
      cycle: integrity.cycle,
      timestamp: new Date().toISOString(),
      gi: integrity.global_integrity,
      overall_sentiment: weightedOverall,
      domains,
    };

    if (isRedisAvailable()) {
      kvSet(CACHE_KEY, payload, 300).catch(() => {});
    }

    return NextResponse.json({ ok: true, ...payload }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        'X-Mobius-Source': 'sentiment-composite-live',
      },
    });
  } catch {
    if (isRedisAvailable()) {
      const snapshot = await kvGet<SentimentSnapshot>(CACHE_KEY);
      if (snapshot) {
        return NextResponse.json({ ok: true, cached: true, ...snapshot }, {
          headers: { 'X-Mobius-Source': 'sentiment-composite-kv' },
        });
      }
    }

    return NextResponse.json({ ok: false, error: 'Sentiment composite unavailable' }, { status: 500 });
  }
}
