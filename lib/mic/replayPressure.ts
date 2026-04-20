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

async function loadEnvelope(): Promise<{ ingestPressure: number; lastUpdatedAt: string }> {
  const raw = await kvGet<ReplayPressureKvV1 | LegacyReplayKv>(KV_KEYS.MIC_REPLAY_PRESSURE);
  const now = new Date().toISOString();
  if (!raw || typeof raw !== 'object') {
    return { ingestPressure: 0, lastUpdatedAt: now };
  }
  if ('ingestPressure' in raw && typeof raw.ingestPressure === 'number' && Number.isFinite(raw.ingestPressure)) {
    return { ingestPressure: raw.ingestPressure, lastUpdatedAt: raw.lastUpdatedAt ?? now };
  }
  if ('decayedPressure' in raw && typeof raw.decayedPressure === 'number' && Number.isFinite(raw.decayedPressure)) {
    return { ingestPressure: raw.decayedPressure, lastUpdatedAt: raw.lastUpdatedAt ?? now };
  }
  return { ingestPressure: 0, lastUpdatedAt: now };
}

/**
 * ECHO ingest: bump ingest-side pressure from duplicate suppressions (bounded per batch).
 */
export async function recordReplayPressureFromIngest(duplicateSuppressedCount: number): Promise<void> {
  const dups = Math.max(0, Math.floor(duplicateSuppressedCount));
  if (dups === 0) return;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const { ingestPressure, lastUpdatedAt } = await loadEnvelope();
  const decayed = decayValue(ingestPressure, lastUpdatedAt, nowMs);
  const bump = Math.min(dups * PER_DUPLICATE_SUPPRESSED, INGEST_BATCH_CAP);
  const next: ReplayPressureKvV1 = {
    schema: 'MIC_REPLAY_PRESSURE_V1',
    ingestPressure: Number(Math.min(decayed + bump, 1).toFixed(4)),
    lastUpdatedAt: nowIso,
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
