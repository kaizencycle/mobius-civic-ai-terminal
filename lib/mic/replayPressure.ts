/**
 * C-287 — replay pressure: ingest-time duplicate bumps (KV, time-decayed) + deposit-window ratio (ephemeral).
 */

import { kvGet, kvSet, KV_KEYS, KV_TTL_SECONDS } from '@/lib/kv/store';
import type { MicReplayStatus } from '@/lib/mic/types';

const REPLAY_HALF_LIFE_HOURS = 24;
const PER_DUPLICATE_SUPPRESSED = 0.005;
const INGEST_BATCH_CAP = 0.3;
const DEPOSIT_RATIO_WEIGHT = 0.45;

export type ReplayPressureKvV1 = {
  schema: 'MIC_REPLAY_PRESSURE_V1';
  /** Accumulated pressure from ECHO duplicate suppression (decayed by time). */
  ingestPressure: number;
  lastUpdatedAt: string;
  /**
   * Last MIC readiness–resolved total (ingest decay + deposit-window ratio), RFC3339.
   * Used so ops/catalog can see a fresh KV echo of replay without re-running deposit math.
   */
  snapshot_total?: number;
  snapshot_at?: string;
};

type LegacyReplayKv = {
  schema?: string;
  decayedPressure?: number;
  lastUpdatedAt?: string;
};

function statusFromPressure(p: number): MicReplayStatus {
  if (p >= 0.35) return 'blocked';
  if (p >= 0.15) return 'elevated';
  return 'clear';
}

function decayValue(prev: number, lastIso: string, nowMs: number): number {
  const last = new Date(lastIso).getTime();
  if (!Number.isFinite(last)) return prev;
  const hoursElapsed = Math.max(0, (nowMs - last) / (1000 * 60 * 60));
  const decayFactor = Math.pow(0.5, hoursElapsed / REPLAY_HALF_LIFE_HOURS);
  return prev * decayFactor;
}

type LoadedEnvelope = {
  ingestPressure: number;
  lastUpdatedAt: string;
  snapshotTotal: number | null;
  snapshotAt: string | null;
};

async function loadEnvelope(): Promise<LoadedEnvelope> {
  const raw = await kvGet<ReplayPressureKvV1 | LegacyReplayKv>(KV_KEYS.MIC_REPLAY_PRESSURE);
  const now = new Date().toISOString();
  if (!raw || typeof raw !== 'object') {
    return { ingestPressure: 0, lastUpdatedAt: now, snapshotTotal: null, snapshotAt: null };
  }
  const snapT =
    'snapshot_total' in raw && typeof raw.snapshot_total === 'number' && Number.isFinite(raw.snapshot_total)
      ? raw.snapshot_total
      : null;
  const snapA =
    'snapshot_at' in raw && typeof raw.snapshot_at === 'string' && raw.snapshot_at.trim() !== ''
      ? raw.snapshot_at.trim()
      : null;
  if ('ingestPressure' in raw && typeof raw.ingestPressure === 'number' && Number.isFinite(raw.ingestPressure)) {
    return {
      ingestPressure: raw.ingestPressure,
      lastUpdatedAt: raw.lastUpdatedAt ?? now,
      snapshotTotal: snapT,
      snapshotAt: snapA,
    };
  }
  if ('decayedPressure' in raw && typeof raw.decayedPressure === 'number' && Number.isFinite(raw.decayedPressure)) {
    return {
      ingestPressure: raw.decayedPressure,
      lastUpdatedAt: raw.lastUpdatedAt ?? now,
      snapshotTotal: snapT,
      snapshotAt: snapA,
    };
  }
  return { ingestPressure: 0, lastUpdatedAt: now, snapshotTotal: null, snapshotAt: null };
}

/**
 * ECHO ingest: bump ingest-side pressure from duplicate suppressions (bounded per batch).
 */
export async function recordReplayPressureFromIngest(duplicateSuppressedCount: number): Promise<void> {
  const dups = Math.max(0, Math.floor(duplicateSuppressedCount));
  if (dups === 0) return;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const env = await loadEnvelope();
  const decayed = decayValue(env.ingestPressure, env.lastUpdatedAt, nowMs);
  const bump = Math.min(dups * PER_DUPLICATE_SUPPRESSED, INGEST_BATCH_CAP);
  const next: ReplayPressureKvV1 = {
    schema: 'MIC_REPLAY_PRESSURE_V1',
    ingestPressure: Number(Math.min(decayed + bump, 1).toFixed(4)),
    lastUpdatedAt: nowIso,
    ...(env.snapshotTotal !== null && env.snapshotAt !== null
      ? { snapshot_total: env.snapshotTotal, snapshot_at: env.snapshotAt }
      : {}),
  };
  await kvSet(KV_KEYS.MIC_REPLAY_PRESSURE, next, KV_TTL_SECONDS.MIC_REPLAY_PRESSURE);
}

/**
 * MIC readiness: decayed ingest pressure + current deposit-list replay ratio (read-only merge).
 */
export async function resolveReplayPressureWithDecay(
  depositSampleRatio: number,
): Promise<{ replayPressure: number; status: MicReplayStatus; replay_decay_half_life_hours: number }> {
  const ratio = Number.isFinite(depositSampleRatio) ? Math.max(0, Math.min(1, depositSampleRatio)) : 0;
  const nowMs = Date.now();
  const { ingestPressure, lastUpdatedAt } = await loadEnvelope();
  const decayedIngest = decayValue(ingestPressure, lastUpdatedAt, nowMs);
  const fromDeposits = ratio * DEPOSIT_RATIO_WEIGHT;
  const total = Number(Math.min(decayedIngest + fromDeposits, 1).toFixed(4));
  return {
    replayPressure: total,
    status: statusFromPressure(total),
    replay_decay_half_life_hours: REPLAY_HALF_LIFE_HOURS,
  };
}

/**
 * Persist resolved replay total for KV visibility (catalog / probes). Echo ingest path
 * continues to own `ingestPressure`; we add a short-TTL snapshot of the merged total.
 */
export async function persistResolvedReplayPressureToKv(resolvedTotal: number): Promise<void> {
  const total = Number.isFinite(resolvedTotal) ? Math.max(0, Math.min(1, resolvedTotal)) : 0;
  const nowIso = new Date().toISOString();
  const env = await loadEnvelope();
  /** Do not rewrite `lastUpdatedAt` — ECHO ingest uses it for ingest-side decay. */
  const next: ReplayPressureKvV1 = {
    schema: 'MIC_REPLAY_PRESSURE_V1',
    ingestPressure: Number(env.ingestPressure.toFixed(4)),
    lastUpdatedAt: env.lastUpdatedAt,
    snapshot_total: Number(total.toFixed(4)),
    snapshot_at: nowIso,
  };
  await kvSet(KV_KEYS.MIC_REPLAY_PRESSURE, next, KV_TTL_SECONDS.MIC_REPLAY_PRESSURE);
}
