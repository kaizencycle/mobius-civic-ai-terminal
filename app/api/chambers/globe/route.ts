import { NextResponse } from 'next/server';
import { pollAllMicroAgents } from '@/lib/agents/micro';
import { getEchoEpicon } from '@/lib/echo/store';
import { computeIntegrityPayload } from '@/lib/integrity/buildStatus';
import { GET as getSentiment } from '@/app/api/sentiment/composite/route';

export const dynamic = 'force-dynamic';

export async function GET() {
  const timestamp = new Date().toISOString();
  try {
    // C-290: fetch sentiment in parallel with the micro sweep. Previously this
    // route always returned sentiment: null, causing globe domain rings to
    // never populate from the full chamber fetch.
    const [micro, integrity, sentimentRes] = await Promise.all([
      pollAllMicroAgents(),
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
      micro: null,
      echo: { epicon: [] },
      sentiment: null,
      timestamp,
    });
  }
}
