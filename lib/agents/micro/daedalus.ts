// ============================================================================
// DAEDALUS-µ — Dev/Infrastructure Micro Sub-Agent
//
// Polls GitHub API (public, no key needed for read), npm registry,
// and self-ping for uptime.
// CC0 Public Domain
// ============================================================================

import {
  type AgentPollResult,
  type MicroSignal,
  type MicroAgentConfig,
  classifySeverity,
  normalizeDirect,
  normalizeInverse,
  safeFetch,
} from './core';
export const DAEDALUS_CONFIG: MicroAgentConfig = {
  name: 'DAEDALUS-µ',
  description: 'Infrastructure resilience — repo health, dependency freshness, uptime',
  pollIntervalMs: 10 * 60 * 1000, // 10 minutes
  sources: ['GitHub API', 'npm Registry', 'Self-ping'],
};

// ── GitHub: recent commit activity on Mobius repos ────────────────────────
type GitHubEvent = {
  type: string;
  created_at: string;
  repo: { name: string };
};

async function pollGitHub(): Promise<MicroSignal | null> {
  const url = 'https://api.github.com/users/kaizencycle/events/public?per_page=30';

  const data = await safeFetch<GitHubEvent[]>(url);
  if (!data || !Array.isArray(data)) return null;

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // Count events in last 24h and last 7d
  const last24h = data.filter((e) => now - new Date(e.created_at).getTime() < dayMs).length;
  const last7d = data.filter((e) => now - new Date(e.created_at).getTime() < 7 * dayMs).length;

  // Active development = healthy. 0 events in 7d = concerning
  const activityScore = normalizeDirect(last7d, 0, 20);

  // Freshness: hours since last event
  const latestEvent = data[0];
  const hoursSinceLast = latestEvent
    ? (now - new Date(latestEvent.created_at).getTime()) / (60 * 60 * 1000)
    : 168; // default to 1 week

  const freshnessScore = normalizeInverse(hoursSinceLast, 0, 168);

  const value = Number((0.5 * activityScore + 0.5 * freshnessScore).toFixed(3));

  return {
    agentName: 'DAEDALUS-µ',
    source: 'GitHub API',
    timestamp: new Date().toISOString(),
    value,
    label: `GitHub: ${last24h} events/24h, ${last7d} events/7d, last ${Math.round(hoursSinceLast)}h ago`,
    severity: classifySeverity(value, { watch: 0.4, elevated: 0.2, critical: 0.05 }),
    raw: { last24h, last7d, hoursSinceLast: Math.round(hoursSinceLast) },
  };
}

// ── npm: check Next.js version freshness ──────────────────────────────────
type NpmPackage = {
  'dist-tags'?: { latest?: string };
  time?: Record<string, string>;
};

async function pollNpm(): Promise<MicroSignal | null> {
  const url = 'https://registry.npmjs.org/next';

  const data = await safeFetch<NpmPackage>(url);
  if (!data?.['dist-tags']?.latest || !data?.time) return null;

  const latest = data['dist-tags'].latest;
  const latestPublished = data.time[latest];
  if (!latestPublished) return null;

  const daysSinceRelease =
    (Date.now() - new Date(latestPublished).getTime()) / (24 * 60 * 60 * 1000);

  // Fresh release (<7d) = 1.0, very old (>90d) = low
  const value = Number(normalizeInverse(daysSinceRelease, 0, 90).toFixed(3));

  return {
    agentName: 'DAEDALUS-µ',
    source: 'npm Registry',
    timestamp: new Date().toISOString(),
    value,
    label: `Next.js latest: v${latest}, released ${Math.round(daysSinceRelease)}d ago`,
    severity: classifySeverity(value, { watch: 0.5, elevated: 0.3, critical: 0.1 }),
    raw: { package: 'next', latest, daysSinceRelease: Math.round(daysSinceRelease) },
  };
}

// ── Self-ping: check if the terminal itself is responding ─────────────────
//
// C-283 (ATLAS audit): the previous implementation unconditionally called the
// `VERCEL_URL` deployment URL, which is protected by Vercel Deployment
// Protection on preview/branch deployments and returns 401 to anonymous
// callers. That produced a persistent 401 signal ("Self-ping: 401 in 23ms
// (deploy auth)") visible on the Globe.
//
// Fix strategy, in order of preference:
//   1. `NEXT_PUBLIC_SITE_URL` — the canonical public alias (e.g. mobius.civic).
//      Production traffic hits this URL and is never auth-gated.
//   2. `VERCEL_PROJECT_PRODUCTION_URL` — Vercel's alias for the production
//      deployment (no deployment protection when "Protect Production" is off).
//   3. `VERCEL_URL` + `VERCEL_AUTOMATION_BYPASS_SECRET` header — Vercel's
//      official way to bypass deployment protection for automation.
//   4. `VERCEL_URL` — last resort; if protection is enabled this will 401
//      and we degrade gracefully instead of reporting a false-positive.
async function pollSelfPing(): Promise<MicroSignal | null> {
  const candidates: Array<{ url: string; headers?: Record<string, string>; label: string }> = [];

  const publicSite = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (publicSite) {
    candidates.push({ url: `${publicSite.replace(/\/$/, '')}/api/health`, label: 'public-site' });
  }

  const prodUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (prodUrl) {
    candidates.push({
      url: `https://${prodUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}/api/health`,
      label: 'vercel-prod-alias',
    });
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  const bypass =
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() ||
    process.env.VERCEL_PROTECTION_BYPASS?.trim();
  if (vercelUrl && bypass) {
    candidates.push({
      url: `https://${vercelUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}/api/health`,
      headers: { 'x-vercel-protection-bypass': bypass, 'x-vercel-set-bypass-cookie': 'false' },
      label: 'vercel-url-bypass',
    });
  }
  if (vercelUrl) {
    candidates.push({
      url: `https://${vercelUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}/api/health`,
      label: 'vercel-url',
    });
  }

  if (candidates.length === 0) {
    return {
      agentName: 'DAEDALUS-µ',
      source: 'Self-ping',
      timestamp: new Date().toISOString(),
      value: 0.5,
      label: 'Self-ping: no public URL configured, defaulting to 0.5',
      severity: 'watch',
    };
  }

  let lastStatus: number | null = null;
  let lastLabel: string | null = null;

  for (const { url, headers, label } of candidates) {
    const start = Date.now();
    try {
      const res = await fetch(url, { cache: 'no-store', headers });
      const latencyMs = Date.now() - start;

      if (res.ok) {
        const value = Number(normalizeInverse(latencyMs, 0, 3000).toFixed(3));
        return {
          agentName: 'DAEDALUS-µ',
          source: 'Self-ping',
          timestamp: new Date().toISOString(),
          value,
          label: `Self-ping: OK in ${latencyMs}ms (${label})`,
          severity: classifySeverity(value),
          raw: { status: 200, latencyMs, via: label },
        };
      }

      lastStatus = res.status;
      lastLabel = label;
      // Keep trying other candidates — 401 from a protected URL shouldn't
      // flag infra as broken if the public URL is still reachable.
    } catch {
      lastStatus = 0;
      lastLabel = label;
    }
  }

  // All candidates failed. If the only failures were auth-related, mark as
  // degraded rather than critical — infra is fine, it's just that the bypass
  // isn't configured.
  if (lastStatus === 401 || lastStatus === 403) {
    return {
      agentName: 'DAEDALUS-µ',
      source: 'Self-ping',
      timestamp: new Date().toISOString(),
      value: 0.5,
      label: `Self-ping: ${lastStatus} (deploy protection; set VERCEL_AUTOMATION_BYPASS_SECRET or NEXT_PUBLIC_SITE_URL)`,
      severity: 'watch',
      raw: { status: lastStatus, via: lastLabel },
    };
  }

  return {
    agentName: 'DAEDALUS-µ',
    source: 'Self-ping',
    timestamp: new Date().toISOString(),
    value: lastStatus === null ? 0.0 : 0.2,
    label: lastStatus === null ? 'Self-ping: unreachable' : `Self-ping: HTTP ${lastStatus} (${lastLabel})`,
    severity: lastStatus === null ? 'critical' : 'elevated',
    raw: { status: lastStatus ?? 0, via: lastLabel },
  };
}

// ── Poll all DAEDALUS-µ sources ───────────────────────────────────────────
export async function pollDaedalus(): Promise<AgentPollResult> {
  const errors: string[] = [];
  const signals: MicroSignal[] = [];

  const github = await pollGitHub();
  if (github) signals.push(github);
  else errors.push('GitHub API fetch failed');

  const npm = await pollNpm();
  if (npm) signals.push(npm);
  else errors.push('npm registry fetch failed');

  const ping = await pollSelfPing();
  if (ping) signals.push(ping);
  else errors.push('Self-ping failed');

  return {
    agentName: 'DAEDALUS-µ',
    signals,
    polledAt: new Date().toISOString(),
    errors,
    healthy: signals.length > 0,
  };
}
