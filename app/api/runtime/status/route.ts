import { NextResponse } from 'next/server';
import { mockRuntimeStatus } from '@/lib/mock-data';
import { mockEnvelope } from '@/lib/response-envelope';

export const dynamic = 'force-dynamic';

type GitHubCommit = {
  commit?: {
    message?: string;
    author?: {
      date?: string;
    };
  };
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

export async function GET() {
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
    if (!res.ok) throw new Error(`GitHub commits fetch failed (${res.status})`);

    const commits = (await res.json()) as GitHubCommit[];
    const latest = commits[0];
    const lastRun = latest?.commit?.author?.date ?? null;
    if (!lastRun) throw new Error('Latest commit missing author date');

    const seconds = Math.max(
      0,
      Math.floor((Date.now() - new Date(lastRun).getTime()) / 1000)
    );

    return NextResponse.json(
      {
        ok: true,
        source: 'github-commit',
        freshAt: lastRun,
        staleAt: null,
        degraded: false,
        last_run: lastRun,
        cycle_id: extractCycleId(latest?.commit?.message),
        freshness: {
          status: computeFreshness(seconds),
          seconds,
        },
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=60',
        },
      }
    );
  } catch (error) {
    console.error('runtime/status github fetch failed', error);
    return NextResponse.json(
      {
        ok: true,
        ...mockRuntimeStatus(),
        ...mockEnvelope('GitHub heartbeat unavailable'),
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=60',
        },
      }
    );
  }
}
