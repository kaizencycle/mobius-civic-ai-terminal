import { NextResponse } from 'next/server';
import { mockRuntimeStatus } from '@/lib/mock-data';
import { mockEnvelope } from '@/lib/response-envelope';
import { kvGet, KV_KEYS } from '@/lib/kv/store';

export const dynamic = 'force-dynamic';

type GitHubCommit = {
  commit?: {
    message?: string;
    author?: {
      date?: string;
    };
  };
};

type SystemPulse = {
  ok?: boolean;
  composite?: number;
  cycle?: string;
  instruments?: number;
  anomalies?: number;
  timestamp?: string;
};

function computeFreshness(seconds: number) {
  if (seconds < 600) return 'fresh' as const;
  if (seconds < 1800) return 'nominal' as const;
  if (seconds < 3600) return 'stale' as const;
  return 'degraded' as const;
}

function extractCycleId(message: string | undefined): string | null {
  if (!message) return null;
  const match = message.match(/heartbeat:\s*([A-Za-z]-\d+)/i);
  return match?.[1] ?? null;
}

function ageSeconds(timestamp: string | null | undefined): number | null {
  if (!timestamp) return null;
  const ms = new Date(timestamp).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / 1000));
}

async function fetchLatestCommit(): Promise<{
  lastRun: string | null;
  cycleId: string | null;
  error: string | null;
}> {
  try {
    const headers: HeadersInit = { Accept: 'application/vnd.github+json' };
    const token = process.env.GITHUB_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(
      'https://api.github.com/repos/kaizencycle/mobius-civic-ai-terminal/commits?per_page=1&sha=main',
      {
        headers,
        cache: 'no-store',
      }
    );

    if (!res.ok) {
      return {
        lastRun: null,
        cycleId: null,
        error: `GitHub commits fetch failed (${res.status})`,
      };
    }

    const commits = (await res.json()) as GitHubCommit[];
    const latest = commits[0];
    return {
      lastRun: latest?.commit?.author?.date ?? null,
      cycleId: extractCycleId(latest?.commit?.message),
      error: null,
    };
  } catch (error) {
    return {
      lastRun: null,
      cycleId: null,
      error: error instanceof Error ? error.message : 'GitHub commit lookup failed',
    };
  }
}

export async function GET() {
  const pulse = await kvGet<SystemPulse>(KV_KEYS.SYSTEM_PULSE);

  const git = pulse?.timestamp
    ? { lastRun: null, cycleId: null, error: null }
    : await Promise.race([
        fetchLatestCommit(),
        new Promise<{ lastRun: null; cycleId: null; error: string }>((resolve) =>
          setTimeout(() => resolve({ lastRun: null, cycleId: null, error: 'github_timeout' }), 3000),
        ),
      ]);

  const runtimeSource = pulse?.timestamp ? 'system-pulse' : 'github-commit';
  const runtimeTimestamp = pulse?.timestamp ?? git.lastRun;

  if (!runtimeTimestamp) {
    return NextResponse.json(
      {
        ok: true,
        ...mockRuntimeStatus(),
        ...mockEnvelope('Runtime heartbeat unavailable'),
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=60',
        },
      }
    );
  }

  const seconds = ageSeconds(runtimeTimestamp) ?? 0;
  const freshnessStatus = computeFreshness(seconds);
  const deploySeconds = ageSeconds(git.lastRun);

  return NextResponse.json(
    {
      ok: true,
      source: runtimeSource,
      freshAt: runtimeTimestamp,
      staleAt: null,
      degraded: runtimeSource !== 'system-pulse' || freshnessStatus === 'degraded' || freshnessStatus === 'stale',
      last_run: runtimeTimestamp,
      cycle_id: pulse?.cycle ?? git.cycleId,
      freshness: {
        status: freshnessStatus,
        seconds,
      },
      authority: {
        runtime_source: runtimeSource,
        pulse_available: Boolean(pulse?.timestamp),
        deploy_available: Boolean(git.lastRun),
        github_error: git.error,
      },
      pulse: pulse?.timestamp
        ? {
            timestamp: pulse.timestamp,
            cycle: pulse.cycle ?? null,
            composite: pulse.composite ?? null,
            instruments: pulse.instruments ?? null,
            anomalies: pulse.anomalies ?? null,
            age_seconds: ageSeconds(pulse.timestamp),
          }
        : null,
      deploy: git.lastRun
        ? {
            source: 'github-commit',
            freshAt: git.lastRun,
            freshness: {
              status: computeFreshness(deploySeconds ?? 0),
              seconds: deploySeconds ?? 0,
            },
          }
        : null,
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=60',
      },
    }
  );
}
