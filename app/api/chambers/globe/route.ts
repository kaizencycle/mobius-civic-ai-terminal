import { NextResponse } from 'next/server';
import { pollAllMicroAgents } from '@/lib/agents/micro';
import { getEchoEpicon } from '@/lib/echo/store';
import { computeIntegrityPayload } from '@/lib/integrity/buildStatus';
import { GET as getSentiment } from '@/app/api/sentiment/composite/route';

export const dynamic = 'force-dynamic';

export async function GET() {
  const timestamp = new Date().toISOString();
  try {
    // OPT-8 (C-291): wrap pollAllMicroAgents in a race with a 7s timeout so the
    // globe chamber can't silently stall when the micro sweep is slow. Previously
    // a slow sweep would hold the entire chamber response hostage.
    const MICRO_TIMEOUT_MS = 7_000;
    const microWithTimeout = Promise.race([
      pollAllMicroAgents(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('micro_sweep_timeout')), MICRO_TIMEOUT_MS),
      ),
    ]);

    const [micro, integrity, sentimentRes] = await Promise.all([
      microWithTimeout.catch(() => null),
      computeIntegrityPayload(),
      getSentiment().catch(() => null),
    ]);

    let sentiment: unknown = null;
    if (sentimentRes?.ok) {
      try {
        sentiment = (await sentimentRes.json()) as unknown;
      } catch {
        sentiment = null;
      }
    }

    return NextResponse.json({
      ok: true,
      fallback: false,
      cycle: integrity.cycle,
      gi: integrity.global_integrity ?? null,
      dva: {
        primaryAgent: 'ECHO',
        tier: 't1',
        chambers: ['globe', 'ledger', 'pulse'],
      },
      micro,
      echo: { epicon: getEchoEpicon() },
      sentiment,
      timestamp,
    });
  } catch {
    return NextResponse.json({
      ok: true,
      fallback: true,
      cycle: 'C-—',
      gi: null,
      dva: {
        primaryAgent: 'ECHO',
        tier: 't1',
        chambers: ['globe', 'ledger', 'pulse'],
      },
      micro: null,
      echo: { epicon: [] },
      sentiment: null,
      timestamp,
    });
  }
}
