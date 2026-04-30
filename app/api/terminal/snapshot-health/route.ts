import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ProbeResult = {
  ok: boolean;
  status: number;
  duration_ms: number;
  error: string | null;
};

type ProbeKey = 'shell' | 'snapshot_lite' | 'kv_health';

const PROBE_TIMEOUT_MS = 1_500;

async function probe(request: NextRequest, path: string): Promise<ProbeResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const response = await fetch(new URL(path, request.nextUrl.origin), {
      cache: 'no-store',
      signal: controller.signal,
    });
    return {
      ok: response.ok,
      status: response.status,
      duration_ms: Date.now() - start,
      error: response.ok ? null : `probe_failed_${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 408,
      duration_ms: Date.now() - start,
      error: error instanceof Error ? error.message : 'probe_failed',
    };
  } finally {
    clearTimeout(timer);
  }
}

function classify(probes: Record<ProbeKey, ProbeResult>): 'nominal' | 'degraded' | 'critical' {
  if (!probes.shell.ok) return 'critical';
  if (!probes.snapshot_lite.ok || !probes.kv_health.ok) return 'degraded';
  if (Object.values(probes).some((p) => p.duration_ms >= PROBE_TIMEOUT_MS * 0.8)) return 'degraded';
  return 'nominal';
}

export async function GET(request: NextRequest) {
  const started = Date.now();
  const [shell, snapshotLite, kvHealth] = await Promise.all([
    probe(request, '/api/terminal/shell'),
    probe(request, '/api/terminal/snapshot-lite'),
    probe(request, '/api/kv/health'),
  ]);

  const probes: Record<ProbeKey, ProbeResult> = {
    shell,
    snapshot_lite: snapshotLite,
    kv_health: kvHealth,
  };
  const status = classify(probes);

  return NextResponse.json(
    {
      ok: status !== 'critical',
      status,
      version: 'C-297.phase1.snapshot-health.v1',
      total_ms: Date.now() - started,
      timeout_ms: PROBE_TIMEOUT_MS,
      probes,
      guidance: [
        'shell critical means the terminal operator surface cannot hydrate safely',
        'snapshot_lite degraded means the shell should render fallback truth and avoid blocking on full snapshot',
        'kv_health degraded means cached lanes may be stale or unavailable',
      ],
      timestamp: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'X-Mobius-Source': 'terminal-snapshot-health',
      },
    },
  );
}
