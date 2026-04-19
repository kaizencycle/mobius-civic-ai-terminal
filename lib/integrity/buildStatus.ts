/**
 * Shared live integrity computation for /api/integrity-status and EVE governance synthesis (C-270).
 */

import { computeGI } from '@/lib/gi/compute';
import type { GIMode } from '@/lib/gi/mode';
import { currentCycleId } from '@/lib/eve/cycle-engine';
import { getEchoEpicon } from '@/lib/echo/store';
import { integrityStatus } from '@/lib/mock/integrityStatus';
import { getHeartbeat } from '@/lib/runtime/heartbeat';
import { getStalenessStatus } from '@/lib/runtime/staleness';
import { scoreBatch } from '@/lib/echo/signal-engine';
import { mockAgents, mockEpicon } from '@/lib/terminal/mock';
import { getTripwireState } from '@/lib/tripwire/store';
import { saveGIState, loadGIState, loadGIStateCarry, isRedisAvailable, type GIState } from '@/lib/kv/store';

function resolveSignalQuality() {
  const epicon = getEchoEpicon();
  const isLive = epicon.length > 0;
  const items = isLive ? epicon : mockEpicon;
  const scores = scoreBatch(items).map((score) => score.signal);

  if (!isLive) {
    return { scores: scores.map((s) => s * 0.8), source: 'mock' as const };
  }
  return { scores, source: 'live' as const };
}

function resolveActiveAgentCount() {
  return mockAgents.filter((agent) => agent.heartbeatOk && agent.status !== 'idle').length;
}

function normalizeTripwireLevel(level: ReturnType<typeof getTripwireState>['level']): 'none' | 'watch' | 'elevated' {
  if (level === 'high' || level === 'triggered' || level === 'suspended' || level === 'elevated') return 'elevated';
  if (level === 'medium' || level === 'watch') return 'watch';
  return 'none';
}

function parseGIMode(value: string): GIMode | null {
  if (value === 'green' || value === 'yellow' || value === 'red') return value;
  return null;
}

function parseTerminalStatus(value: string): IntegrityPayload['terminal_status'] | null {
  if (value === 'nominal' || value === 'stressed' || value === 'critical') return value;
  return null;
}

export type IntegrityPayload = {
  cycle: string;
  timestamp: string;
  global_integrity: number;
  mode: GIMode;
  mii_baseline: number;
  mic_supply: number;
  terminal_status: 'nominal' | 'stressed' | 'critical';
  primary_driver: string;
  summary: string;
  source: 'live' | 'mock' | 'cached' | 'kv';
  kv?: boolean;
  signals: Record<string, number>;
};

/**
 * Same GI/MII posture as the integrity ribbon (including Redis cold-start cache when applicable).
 *
 * Source priority:
 *   1. KV (gi:latest) — primary when KV is reachable and GI_STATE key exists and is fresh
 *   2. local computation — fallback when KV is unreachable or GI_STATE key is missing/stale
 */
export async function computeIntegrityPayload(): Promise<IntegrityPayload> {
  // 1. Primary: read from KV when available
  if (isRedisAvailable()) {
    const cached = await loadGIState();
    const carry = await loadGIStateCarry();
    const pick = (() => {
      if (cached) {
        const age = Date.now() - new Date(cached.timestamp).getTime();
        const mode = parseGIMode(cached.mode);
        const terminal_status = parseTerminalStatus(cached.terminal_status);
        if (age < 15 * 60 * 1000 && mode && terminal_status) return { row: cached, source: 'kv' as const };
      }
      if (carry) {
        const cachedStale =
          cached &&
          typeof cached.global_integrity === 'number' &&
          Date.now() - new Date(cached.timestamp).getTime() >= 15 * 60 * 1000;
        const useCarry = !cached || cachedStale;
        if (useCarry) {
          const mode = parseGIMode(carry.mode);
          const terminal_status = parseTerminalStatus(carry.terminal_status);
          if (mode && terminal_status) return { row: carry, source: 'kv_carry_forward' as const };
        }
      }
      return null;
    })();
    if (pick) {
      const { row, source } = pick;
      return {
        cycle: currentCycleId(),
        timestamp: row.timestamp,
        global_integrity: row.global_integrity,
        mode: parseGIMode(row.mode)!,
        mii_baseline: integrityStatus.mii_baseline,
        mic_supply: integrityStatus.mic_supply,
        terminal_status: parseTerminalStatus(row.terminal_status)!,
        primary_driver:
          source === 'kv_carry_forward'
            ? `${row.primary_driver} (carried forward; primary gi:latest stale or missing)`
            : row.primary_driver,
        summary: 'GI reflects signal quality, freshness, tripwire stability, and active system health.',
        source: source === 'kv_carry_forward' ? 'cached' : 'kv',
        kv: true,
        signals: {
          ...row.signals,
          geopolitics: row.signals.quality,
          economy: row.signals.system,
          sentiment: row.signals.stability,
          information: row.signals.freshness,
        },
      };
    }
  }

  // 2. Fallback: compute locally from in-process signals
  const freshness = getStalenessStatus(getHeartbeat());
  const tripwire = getTripwireState();
  const signalData = resolveSignalQuality();

  const effectiveFreshness =
    signalData.source === 'mock' && freshness.status === 'fresh' ? ('degraded' as const) : freshness.status;

  const computed = computeGI({
    zeusScores: signalData.scores,
    freshness: effectiveFreshness,
    tripwire: normalizeTripwireLevel(tripwire.level),
    activeAgents: resolveActiveAgentCount(),
  });

  const isKv = isRedisAvailable();
  const source: 'live' | 'mock' | 'cached' = signalData.source;

  const coldStart = signalData.source === 'mock' && isKv;
  const driver = coldStart
    ? 'GI computed from baseline signals (ECHO cold-start — awaiting fresh ingest)'
    : computed.primary_driver;

  if (isKv) {
    const giState: GIState = {
      global_integrity: computed.global_integrity,
      mode: computed.mode,
      terminal_status: computed.terminal_status,
      primary_driver: driver,
      source,
      signals: computed.signals,
      timestamp: computed.timestamp,
    };
    saveGIState(giState).catch(() => {});
  }

  return {
    cycle: currentCycleId(),
    timestamp: computed.timestamp,
    global_integrity: computed.global_integrity,
    mode: computed.mode,
    mii_baseline: integrityStatus.mii_baseline,
    mic_supply: integrityStatus.mic_supply,
    terminal_status: computed.terminal_status,
    primary_driver: driver,
    summary: computed.summary,
    source,
    kv: isKv,
    signals: {
      ...computed.signals,
      geopolitics: computed.signals.quality,
      economy: computed.signals.system,
      sentiment: computed.signals.stability,
      information: computed.signals.freshness,
    },
  };
}

export async function getLiveIntegritySnapshot(): Promise<{ global_integrity: number; mii_baseline: number }> {
  const p = await computeIntegrityPayload();
  return { global_integrity: p.global_integrity, mii_baseline: p.mii_baseline };
}

/**
 * Recompute GI from in-process heartbeat + ECHO store and persist to KV (C-280 cron).
 * Bypasses KV read cache so freshness signal updates on a schedule.
 */
export async function recomputeAndSaveGIState(): Promise<GIState | null> {
  if (!isRedisAvailable()) return null;

  const freshness = getStalenessStatus(getHeartbeat());
  const tripwire = getTripwireState();
  const signalData = resolveSignalQuality();

  const effectiveFreshness =
    signalData.source === 'mock' && freshness.status === 'fresh' ? ('degraded' as const) : freshness.status;

  const computed = computeGI({
    zeusScores: signalData.scores,
    freshness: effectiveFreshness,
    tripwire: normalizeTripwireLevel(tripwire.level),
    activeAgents: resolveActiveAgentCount(),
  });

  const source: 'live' | 'mock' | 'cached' = signalData.source;
  const coldStartCron = signalData.source === 'mock';
  const driver = coldStartCron
    ? 'GI computed from baseline signals (ECHO cold-start — awaiting fresh ingest)'
    : computed.primary_driver;

  const giState: GIState = {
    global_integrity: computed.global_integrity,
    mode: computed.mode,
    terminal_status: computed.terminal_status,
    primary_driver: driver,
    source,
    signals: computed.signals,
    timestamp: computed.timestamp,
  };
  await saveGIState(giState);
  return giState;
}
