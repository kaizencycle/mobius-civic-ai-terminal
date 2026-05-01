import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type MicroAgentRow = {
  agentName?: string;
  healthy?: boolean;
};

type CanonicalMicroPayload = {
  ok?: boolean;
  cached?: boolean;
  source?: string;
  agents?: MicroAgentRow[];
  anomalies?: unknown[];
  composite?: number | null;
  timestamp?: string;
  allSignals?: unknown[];
  healthy?: boolean;
  instrumentCount?: number;
  degraded_instruments?: unknown[];
};

function buildFamilies(agents: MicroAgentRow[] | undefined): Array<{ name: string; healthy: boolean; count: number }> {
  const familyMap = new Map<string, { name: string; healthy: boolean; count: number }>();

  for (const agent of agents ?? []) {
    const family = agent.agentName?.split('-')[0]?.toUpperCase() ?? 'UNKNOWN';
    const row = familyMap.get(family) ?? { name: family, healthy: true, count: 0 };
    row.healthy = row.healthy && agent.healthy !== false;
    row.count += 1;
    familyMap.set(family, row);
  }

  return [...familyMap.values()];
}

async function fetchCanonicalSignals(request: NextRequest): Promise<CanonicalMicroPayload> {
  const url = new URL('/api/signals/micro', request.nextUrl.origin);
  const res = await fetch(url, { cache: 'no-store' });
  const payload = (await res.json()) as CanonicalMicroPayload;
  if (!res.ok || payload?.ok === false) throw new Error(payload?.source ?? `canonical_signals_failed_${res.status}`);
  return payload;
}

export async function GET(request: NextRequest) {
  const timestamp = new Date().toISOString();

  try {
    const micro = await fetchCanonicalSignals(request);

    return NextResponse.json({
      ok: true,
      fallback: micro.source === 'kv-fallback',
      canonical: true,
      source: micro.cached ? (micro.source ?? 'signals-micro-cached') : 'signals-micro-live',
      families: buildFamilies(micro.agents),
      anomalies: Array.isArray(micro.anomalies) ? micro.anomalies : [],
      composite: typeof micro.composite === 'number' ? micro.composite : null,
      last_sweep: micro.timestamp ?? null,
      raw: micro,
      instrumentCount: micro.instrumentCount ?? (Array.isArray(micro.allSignals) ? micro.allSignals.length : null),
      degraded_instruments: Array.isArray(micro.degraded_instruments) ? micro.degraded_instruments : [],
      timestamp,
    });
  } catch (error) {
    return NextResponse.json({
      ok: true,
      fallback: true,
      canonical: false,
      source: 'signals-chamber-fallback',
      error: error instanceof Error ? error.message : 'signals_chamber_failed',
      families: [],
      anomalies: [],
      composite: null,
      last_sweep: null,
      raw: null,
      timestamp,
    });
  }
}
