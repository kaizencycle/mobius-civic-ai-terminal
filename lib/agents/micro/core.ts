// ============================================================================
// Mobius Civic AI Terminal — Micro Sub-Agent Core
// C-258 · PR: Micro Sub-Agent Scaffold
//
// Each micro-agent polls public APIs on a cron interval, normalizes results
// into EPICON signal format, and feeds the Signal Engine. Anomalies fire
// tripwires. No API keys required — free/open data only.
// CC0 Public Domain
// ============================================================================

export type SignalSeverity = 'nominal' | 'watch' | 'elevated' | 'critical';

/** A single normalized signal from a micro-agent */
export interface MicroSignal {
  agentName: string;
  source: string;
  timestamp: string;
  value: number;          // 0–1 normalized
  label: string;
  severity: SignalSeverity;
  raw?: unknown;
}

export type AgentMode = 'nominal' | 'degraded' | 'critical';
export type SourceHealth = 'ok' | 'degraded' | 'failed' | 'cached';

/** Result of a full agent poll cycle */
export interface AgentPollResult {
  agentName: string;
  signals: MicroSignal[];
  polledAt: string;
  errors: string[];
  healthy: boolean;
  /**
   * Optional runtime posture for richer agent-state UIs.
   * Existing consumers can ignore these fields safely.
   */
  mode?: AgentMode;
  sourceStatus?: Record<string, SourceHealth>;
  fallbackUsed?: string | null;
  lastGoodAt?: string | null;
}

/** Configuration for a micro sub-agent */
export interface MicroAgentConfig {
  name: string;
  description: string;
  pollIntervalMs: number;
  sources: string[];
}

/** Severity thresholds — value below threshold triggers that severity */
export function classifySeverity(value: number, thresholds?: { watch?: number; elevated?: number; critical?: number }): SignalSeverity {
  const t = { watch: 0.6, elevated: 0.35, critical: 0.15, ...thresholds };
  if (value <= t.critical) return 'critical';
  if (value <= t.elevated) return 'elevated';
  if (value <= t.watch) return 'watch';
  return 'nominal';
}

/** Invert a raw value into 0–1 where 1 = good, 0 = bad */
export function normalizeInverse(value: number, min: number, max: number): number {
  const clamped = Math.max(min, Math.min(max, value));
  return 1 - (clamped - min) / (max - min);
}

/** Direct normalization: higher = better */
export function normalizeDirect(value: number, min: number, max: number): number {
  const clamped = Math.max(min, Math.min(max, value));
  return (clamped - min) / (max - min);
}

/** Safe JSON fetch with timeout. `signal` on `init` is ignored in favor of the internal timeout controller. */
export async function safeFetch<T>(url: string, timeoutMs = 8000, init?: RequestInit): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      ...(init ?? {}),
      signal: controller.signal,
      cache: init?.cache ?? 'no-store',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Safe text fetch with timeout (RSS, XML, plain). */
export async function safeFetchText(url: string, timeoutMs = 8000, init?: RequestInit): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      ...(init ?? {}),
      signal: controller.signal,
      cache: init?.cache ?? 'no-store',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export type SafeFetchMeta<T> = {
  ok: boolean;
  status: number | null;
  data: T | null;
  error: string | null;
};

/** Like `safeFetch` but preserves HTTP status for operator-visible error strings (C-286). */
export async function safeFetchWithMeta<T>(url: string, timeoutMs = 8000, init?: RequestInit): Promise<SafeFetchMeta<T>> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      ...(init ?? {}),
      signal: controller.signal,
      cache: init?.cache ?? 'no-store',
    });
    clearTimeout(timer);
    const status = res.status;
    if (!res.ok) {
      return {
        ok: false,
        status,
        data: null,
        error: `HTTP ${status} ${res.statusText}`.trim(),
      };
    }
    return {
      ok: true,
      status,
      data: ((await res.json()) as T) ?? null,
      error: null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'fetch failed';
    return { ok: false, status: null, data: null, error: msg };
  }
}
