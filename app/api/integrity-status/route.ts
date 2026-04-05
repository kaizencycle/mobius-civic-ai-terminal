import { NextResponse } from 'next/server';
import { computeIntegrityPayload } from '@/lib/integrity/buildStatus';

export const dynamic = 'force-dynamic';

export async function GET() {
  const payload = await computeIntegrityPayload();
  const renderGicUrl = process.env.RENDER_GIC_URL;

  if (!renderGicUrl) {
    return NextResponse.json({ ok: true as const, degraded: true, ...payload });
  }

  try {
    const response = await fetch(`${renderGicUrl}/compute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        signals: payload.signals,
        cycle: payload.cycle,
      }),
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error(`[render:gic] ${response.status} ${response.statusText}`);
      return NextResponse.json({ ok: true as const, degraded: true, ...payload });
    }

    const remote = (await response.json()) as {
      global_integrity?: number;
      gi?: number;
      mode?: 'green' | 'yellow' | 'red';
      summary?: string;
    };

    const computedGi =
      typeof remote.global_integrity === 'number'
        ? remote.global_integrity
        : typeof remote.gi === 'number'
          ? remote.gi
          : payload.global_integrity;

    return NextResponse.json({
      ok: true as const,
      ...payload,
      global_integrity: computedGi,
      mode: remote.mode ?? payload.mode,
      summary: remote.summary ?? payload.summary,
      source: 'gic-indexer',
      degraded: false,
    });
  } catch (error) {
    console.error('[render:gic] request failed', error);
    return NextResponse.json({ ok: true as const, degraded: true, ...payload });
  }
}
