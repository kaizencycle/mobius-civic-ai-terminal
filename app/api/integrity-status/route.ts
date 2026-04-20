import { NextResponse } from 'next/server';
import { computeIntegrityPayload } from '@/lib/integrity/buildStatus';
import { getEchoIntegrity } from '@/lib/echo/store';
import { resolveGiChain } from '@/lib/gi/resolveGiChain';
import { loadMicReadinessSnapshotRaw } from '@/lib/mic/loadReadinessSnapshot';

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
  const micRaw = await loadMicReadinessSnapshotRaw();
  const chain = await resolveGiChain({ micReadinessSnapshotRaw: micRaw.raw });
  const mergedPayload = {
    ...payload,
    ...(chain.gi !== null
      ? {
          global_integrity: chain.gi,
          mode: (chain.mode as typeof payload.mode) ?? payload.mode,
          terminal_status: (chain.terminal_status as typeof payload.terminal_status) ?? payload.terminal_status,
          timestamp: chain.timestamp ?? payload.timestamp,
        }
      : {}),
    gi_provenance: chain.source,
    gi_verified: chain.verified,
    gi_degraded: chain.degraded,
    gi_age_seconds: chain.age_seconds,
    mic_readiness_snapshot_source: micRaw.source,
  };
  const renderGicUrl = process.env.RENDER_GIC_URL;

  if (!renderGicUrl) {
    const mic = echoMicProvisional();
    return NextResponse.json({
      ok: true as const,
      degraded: true,
      ...mergedPayload,
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
        signals: mergedPayload.signals,
        cycle: mergedPayload.cycle,
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
        ...mergedPayload,
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
          : mergedPayload.global_integrity;

    const mic = echoMicProvisional();
    return NextResponse.json({
      ok: true as const,
      ...mergedPayload,
      ...mic,
      global_integrity: computedGi,
      mode: remote.mode ?? mergedPayload.mode,
      summary: remote.summary ?? mergedPayload.summary,
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
      ...mergedPayload,
      ...mic,
      authority: buildAuthority(payload, true, false),
    });
  }
}
