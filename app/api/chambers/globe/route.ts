import { NextResponse } from 'next/server';
import { pollAllMicroAgents } from '@/lib/agents/micro';
import { getEchoEpicon } from '@/lib/echo/store';
import { computeIntegrityPayload } from '@/lib/integrity/buildStatus';

export const dynamic = 'force-dynamic';

export async function GET() {
  const timestamp = new Date().toISOString();
  try {
    const [micro, integrity] = await Promise.all([pollAllMicroAgents(), computeIntegrityPayload()]);
    return NextResponse.json({
      ok: true,
      fallback: false,
      cycle: integrity.cycle,
      micro,
      echo: { epicon: getEchoEpicon() },
      sentiment: null,
      timestamp,
    });
  } catch {
    return NextResponse.json({
      ok: true,
      fallback: true,
      cycle: 'C-—',
      micro: null,
      echo: { epicon: [] },
      sentiment: null,
      timestamp,
    });
  }
}
