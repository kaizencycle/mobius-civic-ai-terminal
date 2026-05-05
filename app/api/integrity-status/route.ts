import { NextResponse } from 'next/server';
import { computeIntegrityPayload } from '@/lib/integrity/buildStatus';
import { getEchoIntegrity } from '@/lib/echo/store';
import { resolveGiChain } from '@/lib/gi/resolveGiChain';
import { loadMicReadinessSnapshotRaw } from '@/lib/mic/loadReadinessSnapshot';
import { kvGet } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';

// Fix 4: read MIC totals from KV when in-memory ECHO store is empty (cold start)
async function echoMicProvisional(): Promise<{ totalMicProvisional: number; totalMicMinted: number }> {
  const i = getEchoIntegrity();
  const inMemory =
    i && typeof i.totalMicProvisional === 'number' && i.totalMicProvisional > 0
      ? i.totalMicProvisional
      : i && typeof i.totalMicMinted === 'number' && i.totalMicMinted > 0
        ? i.totalMicMinted
        : 0;

  if (inMemory > 0) return { totalMicProvisional: inMemory, totalMicMinted: inMemory };

  try {
    const kv = await kvGet<{ totalMicProvisional?: number; totalMicMinted?: number }>('mic:cycle:totals');
    const v = kv?.totalMicProvisional ?? kv?.totalMicMinted ?? 0;
    return { totalMicProvisional: v, totalMicMinted: v };
  } catch {
    return { totalMicProvisional: 0, totalMicMinted: 0 };
  }
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

  // Resolve MIC totals once for all branches (Fix 4: async KV fallback)
  const mic = await echoMicProvisional();

  if (!renderGicUrl) {
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
    return NextResponse.json({
      ok: true as const,
      degraded: true,
      ...mergedPayload,
      ...mic,
      authority: buildAuthority(payload, true, false),
    });
  }
}
