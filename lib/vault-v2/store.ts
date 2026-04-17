/**
 * Vault v2 KV store.
 *
 * Key layout:
 *   vault:in_progress_balance        → number, running accumulator 0..<50
 *   vault:in_progress_hashes         → content sigs accruing into next seal
 *   vault:seals:index                → ordered array of seal_ids
 *   vault:seal:latest                → most recent seal_id (quick chain access)
 *   vault:seal:{seal_id}             → full Seal record
 *   vault:seal:candidate             → in-flight SealCandidate awaiting attestations
 *
 * All keys use RAW Redis key names (no `mobius:` prefix) — distinct namespace
 * from v1 `mobius:vault:global:*` keys. v1 keys remain untouched.
 */

import { Redis } from '@upstash/redis';
import type { Seal, SealAttestation, SealCandidate, SentinelAgent } from '@/lib/vault-v2/types';

const BALANCE_KEY = 'vault:in_progress_balance';
const IN_PROGRESS_HASHES_KEY = 'vault:in_progress_hashes';
const SEALS_INDEX_KEY = 'vault:seals:index';
const LATEST_SEAL_KEY = 'vault:seal:latest';
const CANDIDATE_KEY = 'vault:seal:candidate';

function sealKey(seal_id: string): string {
  return `vault:seal:${seal_id}`;
}

function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    return new Redis({ url, token });
  } catch {
    return null;
  }
}

function parseMaybeJson<T>(raw: unknown): T | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  return raw as T;
}

// ────────────────────────────────────────────────────────────────
// Balance (in-progress accumulator)
// ────────────────────────────────────────────────────────────────

export async function getInProgressBalance(): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;
  try {
    const raw = await redis.get<number | string>(BALANCE_KEY);
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') {
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

export async function setInProgressBalance(balance: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(BALANCE_KEY, Number(balance.toFixed(6)));
  } catch (err) {
    console.warn('[vault-v2:store] setInProgressBalance failed:', err instanceof Error ? err.message : err);
  }
}

// ────────────────────────────────────────────────────────────────
// In-progress content signatures (tracked for inclusion in next seal)
// ────────────────────────────────────────────────────────────────

export async function readInProgressHashes(): Promise<string[]> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    const raw = await redis.get<string[] | string>(IN_PROGRESS_HASHES_KEY);
    if (Array.isArray(raw)) return raw;
    const parsed = parseMaybeJson<string[]>(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeInProgressHashes(hashes: string[]): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(IN_PROGRESS_HASHES_KEY, hashes);
  } catch (err) {
    console.warn('[vault-v2:store] writeInProgressHashes failed:', err instanceof Error ? err.message : err);
  }
}

export async function clearInProgressHashes(): Promise<void> {
  await writeInProgressHashes([]);
}

// ────────────────────────────────────────────────────────────────
// Seal index + chain access
// ────────────────────────────────────────────────────────────────

export async function listSealIds(): Promise<string[]> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    const raw = await redis.get<string[] | string>(SEALS_INDEX_KEY);
    if (Array.isArray(raw)) return raw;
    const parsed = parseMaybeJson<string[]>(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function countSeals(): Promise<number> {
  const ids = await listSealIds();
  return ids.length;
}

export async function getLatestSealId(): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<string>(LATEST_SEAL_KEY);
    return typeof raw === 'string' && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

export async function getLatestSeal(): Promise<Seal | null> {
  const id = await getLatestSealId();
  if (!id) return null;
  return getSeal(id);
}

export async function getSeal(seal_id: string): Promise<Seal | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<Seal | string>(sealKey(seal_id));
    if (raw && typeof raw === 'object') return raw as Seal;
    const parsed = parseMaybeJson<Seal>(raw);
    return parsed ?? null;
  } catch {
    return null;
  }
}

export async function listSeals(limit = 50): Promise<Seal[]> {
  const ids = await listSealIds();
  const recent = ids.slice(-limit);
  const results = await Promise.all(recent.map((id) => getSeal(id)));
  return results.filter((s): s is Seal => s !== null).reverse();
}

/**
 * Append a new Seal to the index and mark it latest.
 * Caller is responsible for validating hash chain integrity before calling.
 */
export async function appendSealToChain(seal: Seal): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const ids = await listSealIds();
    if (!ids.includes(seal.seal_id)) {
      ids.push(seal.seal_id);
      await redis.set(SEALS_INDEX_KEY, ids);
    }
    await redis.set(sealKey(seal.seal_id), seal);
    await redis.set(LATEST_SEAL_KEY, seal.seal_id);
  } catch (err) {
    console.warn('[vault-v2:store] appendSealToChain failed:', err instanceof Error ? err.message : err);
  }
}

/**
 * Update/write a Seal record. Does not modify index or latest pointer.
 * Used for quarantined/rejected seals and for fountain_status transitions.
 */
export async function writeSeal(seal: Seal): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(sealKey(seal.seal_id), seal);
  } catch (err) {
    console.warn('[vault-v2:store] writeSeal failed:', err instanceof Error ? err.message : err);
  }
}

// ────────────────────────────────────────────────────────────────
// Candidate (in-flight Seal awaiting attestations)
// ────────────────────────────────────────────────────────────────

export async function getCandidate(): Promise<SealCandidate | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<SealCandidate | string>(CANDIDATE_KEY);
    if (raw && typeof raw === 'object') return raw as SealCandidate;
    const parsed = parseMaybeJson<SealCandidate>(raw);
    return parsed ?? null;
  } catch {
    return null;
  }
}

export async function writeCandidate(candidate: SealCandidate): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(CANDIDATE_KEY, candidate);
  } catch (err) {
    console.warn('[vault-v2:store] writeCandidate failed:', err instanceof Error ? err.message : err);
  }
}

export async function recordAttestation(
  seal_id: string,
  agent: SentinelAgent,
  attestation: SealAttestation,
): Promise<SealCandidate | null> {
  const current = await getCandidate();
  if (!current || current.seal_id !== seal_id) return null;

  const next: SealCandidate = {
    ...current,
    attestations: { ...current.attestations, [agent]: attestation },
    posture: agent === 'AUREA' && attestation.posture ? attestation.posture : current.posture,
  };
  await writeCandidate(next);
  return next;
}

export async function clearCandidate(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(CANDIDATE_KEY);
  } catch (err) {
    console.warn('[vault-v2:store] clearCandidate failed:', err instanceof Error ? err.message : err);
  }
}
