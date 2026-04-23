import { NextResponse } from 'next/server';
import { pollAllMicroAgents } from '@/lib/agents/micro';

export const dynamic = 'force-dynamic';

export async function GET() {
  const timestamp = new Date().toISOString();
  try {
    const micro = await pollAllMicroAgents();
    const familyMap = new Map<string, { name: string; healthy: boolean; count: number }>();
    for (const agent of micro.agents) {
      const family = agent.agentName.split('-')[0]?.toUpperCase() ?? 'UNKNOWN';
      const row = familyMap.get(family) ?? { name: family, healthy: true, count: 0 };
      row.healthy = row.healthy && agent.healthy;
      row.count += 1;
      familyMap.set(family, row);
    }

    return NextResponse.json({
      ok: true,
      fallback: false,
      families: [...familyMap.values()],
      anomalies: micro.anomalies,
      composite: micro.composite,
      last_sweep: micro.timestamp,
      raw: micro,
      timestamp,
    });
  } catch {
    return NextResponse.json({
      ok: true,
      fallback: true,
      families: [],
      anomalies: [],
      composite: null,
      last_sweep: null,
      raw: null,
      timestamp,
    });
  }
}
