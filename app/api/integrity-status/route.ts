import { NextResponse } from 'next/server';
import { computeIntegrityPayload } from '@/lib/integrity/buildStatus';
import { getEchoIntegrity } from '@/lib/echo/store';

export const dynamic = 'force-dynamic';

function echoMicProvisional(): { totalMicProvisional: number; totalMicMinted: number } {
  const i = getEchoIntegrity();
  const v =
    i && typeof i.totalMicProvisional === 'number'
      ? i.totalMicProvisional
      : i && typeof i.totalMicMinted === 'number'
        ? i.totalMicMinted
        : 0;
  return { totalMicProvisional: v, totalMicMinted: v };
}

function buildAuthority(payload: Awaited<ReturnType<typeof computeIntegrityPayload>>, renderEnabled: boolean, renderUsed: boolean) {
  const signalAuthority =
    payload.source === 'kv'
      ? 'kv-state'
      : payload.source === 'live'
        ? 'local-live-compute'
        : payload.source === 'cached'
          ? 'cached-fallback'
          : 'mock-fallback';

  const note =
    payload.source === 'kv'
      ? 'Primary GI is being served from KV-backed state.'
      : payload.source === 'live'
        ? 'GI is being computed from live in-process signals.'
        : 'GI is operating under degraded signal authority.';

  return {
    payload_source: payload.source,
    signal_authority: signalAuthority,
    kv_backed: Boolean(payload.kv),
    render_enabled: renderEnabled,
    render_used: renderUsed,
    gi_origin: renderUsed ? 'gic-indexer' : payload.source,
    note,
  };
}

export async function GET() {
  const payload = await computeIntegrityPayload();
  const renderGicUrl = process.env.RENDER_GIC_URL;

  if (!renderGicUrl) {
    const mic = echoMicProvisional();
    return NextResponse.json({
      ok: true as const,
      degraded: true,
      ...payload,
      ...mic,
      authority: buildAuthority(payload, false, false),
    });
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
      const mic = echoMicProvisional();
      return NextResponse.json({
        ok: true as const,
        degraded: true,
        ...payload,
        ...mic,
        authority: buildAuthority(payload, true, false),
      });
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

    const mic = echoMicProvisional();
    return NextResponse.json({
      ok: true as const,
      ...payload,
      ...mic,
      global_integrity: computedGi,
      mode: remote.mode ?? payload.mode,
      summary: remote.summary ?? payload.summary,
      source: 'gic-indexer',
      degraded: false,
      authority: buildAuthority(payload, true, true),
    });
  } catch (error) {
    console.error('[render:gic] request failed', error);
    const mic = echoMicProvisional();
    return NextResponse.json({
      ok: true as const,
      degraded: true,
      ...payload,
      ...mic,
      authority: buildAuthority(payload, true, false),
    });
  }
}
