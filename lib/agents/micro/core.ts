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

/** Result of a full agent poll cycle */
export interface AgentPollResult {
  agentName: string;
  signals: MicroSignal[];
  polledAt: string;
  errors: string[];
  healthy: boolean;
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

/** Safe JSON fetch with timeout */
export async function safeFetch<T>(url: string, timeoutMs = 8000): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
