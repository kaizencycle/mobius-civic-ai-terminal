/**
 * Vault v2 KV store.
 *
 * Key layout:
 *   vault:in_progress_balance        → number, running accumulator 0..<50
 *   vault:in_progress_hashes         → content sigs accruing into next seal
 *   vault:seals:index                → legacy attested index (kept in sync with :attested)
 *   vault:seals:index:attested       → attested seals only (canonical chain)
 *   vault:seals:index:all            → all finalized seals (attested + quarantined + rejected)
 *   vault:seal:latest                → most recent seal_id (quick chain access)
 *   vault:seal:{seal_id}             → full Seal record
 *   vault:seal:candidate             → in-flight SealCandidate awaiting attestations
 *
 * All keys use RAW Redis key names (no `mobius:` prefix) — distinct namespace
 * from v1 `mobius:vault:global:*` keys. v1 keys remain untouched.
 */

import { Redis } from '@upstash/redis';
import {
  backupRawGet,
  scheduleBackupMirrorRawDel,
  scheduleBackupMirrorRawKey,
} from '@/lib/kv/backup-redis';
import type { Seal, SealAttestation, SealCandidate, SentinelAgent } from '@/lib/vault-v2/types';

const BALANCE_KEY = 'vault:in_progress_balance';
const IN_PROGRESS_HASHES_KEY = 'vault:in_progress_hashes';
/** Legacy key — same sequence as attested index after migration. */
const SEALS_INDEX_LEGACY_KEY = 'vault:seals:index';
/** Attested seals only (canonical chain head / latest). */
const SEALS_INDEX_ATTESTED_KEY = 'vault:seals:index:attested';
/** Every finalized seal (attested, quarantined, rejected) for full audit history. */
const SEALS_INDEX_ALL_KEY = 'vault:seals:index:all';
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

async function rawGetWithFallback<T>(key: string): Promise<unknown | null> {
  const redis = getRedis();
  if (!redis) {
    return backupRawGet<T>(key);
  }
  try {
    const v = await redis.get<T | string>(key);
    if (v !== null && v !== undefined) return v;
    return backupRawGet<T>(key);
  } catch {
    return backupRawGet<T>(key);
  }
}

function mirrorRawSet(key: string, value: unknown): void {
  scheduleBackupMirrorRawKey(key, value);
}

function mirrorRawDel(key: string): void {
  scheduleBackupMirrorRawDel(key);
}

// ────────────────────────────────────────────────────────────────
// Balance (in-progress accumulator)
// ────────────────────────────────────────────────────────────────

export async function getInProgressBalance(): Promise<number> {
  try {
    const raw = await rawGetWithFallback<number | string>(BALANCE_KEY);
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
    const v = Number(balance.toFixed(6));
    await redis.set(BALANCE_KEY, v);
    mirrorRawSet(BALANCE_KEY, v);
  } catch (err) {
    console.warn('[vault-v2:store] setInProgressBalance failed:', err instanceof Error ? err.message : err);
  }
}

// ────────────────────────────────────────────────────────────────
// In-progress content signatures (tracked for inclusion in next seal)
// ────────────────────────────────────────────────────────────────

export async function readInProgressHashes(): Promise<string[]> {
  try {
    const raw = await rawGetWithFallback<string[] | string>(IN_PROGRESS_HASHES_KEY);
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
    mirrorRawSet(IN_PROGRESS_HASHES_KEY, hashes);
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

async function readStringArrayKey(key: string): Promise<string[]> {
  try {
    const raw = await rawGetWithFallback<string[] | string>(key);
    if (Array.isArray(raw)) return raw;
    const parsed = parseMaybeJson<string[]>(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Attested-seal index (advances the proof chain). Migrates from legacy
 * `vault:seals:index` once if the new key is empty.
 */
export async function listSealIds(): Promise<string[]> {
  const redis = getRedis();
  try {
    let ids = await readStringArrayKey(SEALS_INDEX_ATTESTED_KEY);
    if (ids.length === 0) {
      const legacy = await readStringArrayKey(SEALS_INDEX_LEGACY_KEY);
      if (legacy.length > 0) {
        ids = legacy;
        if (redis) {
          await redis.set(SEALS_INDEX_ATTESTED_KEY, ids);
          mirrorRawSet(SEALS_INDEX_ATTESTED_KEY, ids);
        }
      }
    }
    return ids;
  } catch {
    return [];
  }
}

/** Full audit trail: every finalized seal id in order (attested + quarantined + rejected). */
export async function listAllSealIds(): Promise<string[]> {
  const redis = getRedis();
  try {
    let ids = await readStringArrayKey(SEALS_INDEX_ALL_KEY);
    if (ids.length === 0) {
      const attested = await listSealIds();
      if (attested.length > 0) {
        ids = [...attested];
        if (redis) {
          await redis.set(SEALS_INDEX_ALL_KEY, ids);
          mirrorRawSet(SEALS_INDEX_ALL_KEY, ids);
        }
      }
    }
    return ids;
  } catch {
    return [];
  }
}

export async function countSeals(): Promise<number> {
  const ids = await listSealIds();
  return ids.length;
}

export async function countAllSeals(): Promise<number> {
  const ids = await listAllSealIds();
  return ids.length;
}

export async function getLatestSealId(): Promise<string | null> {
  try {
    const raw = await rawGetWithFallback<string>(LATEST_SEAL_KEY);
    if (typeof raw === 'string' && raw.length > 0) return raw;
    return null;
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
  try {
    const raw = await rawGetWithFallback<Seal | string>(sealKey(seal_id));
    if (raw && typeof raw === 'object') return raw as Seal;
    const parsed = parseMaybeJson<Seal>(raw);
    return parsed ?? null;
  } catch {
    return null;
  }
}

export async function listSeals(limit = 50): Promise<Seal[]> {
  const ids = await listSealIds();
  if (ids.length === 0) return [];
  const recent = ids.slice(-limit);
  const results = await Promise.all(recent.map((id) => getSeal(id)));
  return results.filter((s): s is Seal => s !== null).reverse();
}

/** Newest-first list from the full audit index (includes quarantined/rejected). */
export async function listAllSeals(limit = 50): Promise<Seal[]> {
  const ids = await listAllSealIds();
  if (ids.length === 0) return [];
  const recent = ids.slice(-limit);
  const results = await Promise.all(recent.map((id) => getSeal(id)));
  return results.filter((s): s is Seal => s !== null).reverse();
}

async function appendSealIdToIndex(redis: Redis, key: string, seal_id: string): Promise<string[]> {
  const ids = await readStringArrayKey(key);
  if (!ids.includes(seal_id)) {
    ids.push(seal_id);
    await redis.set(key, ids);
    mirrorRawSet(key, ids);
  }
  return ids;
}

/**
 * Append a finalized seal id to the full-history index (all outcomes).
 * Caller must persist the seal body separately (e.g. `writeSeal`).
 */
export async function appendSealToAuditChain(seal: Seal): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await appendSealIdToIndex(redis, SEALS_INDEX_ALL_KEY, seal.seal_id);
  } catch (err) {
    console.warn('[vault-v2:store] appendSealToAuditChain failed:', err instanceof Error ? err.message : err);
  }
}

/**
 * Append a new attested Seal to the attested index and mark it latest.
 * Also appends to the full audit index. Caller validates hash chain integrity.
 */
export async function appendSealToChain(seal: Seal): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const [attested, legacy, all] = await Promise.all([
      readStringArrayKey(SEALS_INDEX_ATTESTED_KEY),
      readStringArrayKey(SEALS_INDEX_LEGACY_KEY),
      readStringArrayKey(SEALS_INDEX_ALL_KEY),
    ]);
    const pushIfMissing = (ids: string[]) => {
      if (!ids.includes(seal.seal_id)) ids.push(seal.seal_id);
      return ids;
    };
    const nextAttested = pushIfMissing([...attested]);
    const nextLegacy = pushIfMissing([...legacy]);
    const nextAll = pushIfMissing([...all]);
    await Promise.all([
      redis.set(SEALS_INDEX_ATTESTED_KEY, nextAttested),
      redis.set(SEALS_INDEX_LEGACY_KEY, nextLegacy),
      redis.set(SEALS_INDEX_ALL_KEY, nextAll),
      redis.set(sealKey(seal.seal_id), seal),
      redis.set(LATEST_SEAL_KEY, seal.seal_id),
    ]);
    mirrorRawSet(SEALS_INDEX_ATTESTED_KEY, nextAttested);
    mirrorRawSet(SEALS_INDEX_LEGACY_KEY, nextLegacy);
    mirrorRawSet(SEALS_INDEX_ALL_KEY, nextAll);
    mirrorRawSet(sealKey(seal.seal_id), seal);
    mirrorRawSet(LATEST_SEAL_KEY, seal.seal_id);
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
    const k = sealKey(seal.seal_id);
    await redis.set(k, seal);
    mirrorRawSet(k, seal);
  } catch (err) {
    console.warn('[vault-v2:store] writeSeal failed:', err instanceof Error ? err.message : err);
  }
}

// ────────────────────────────────────────────────────────────────
// Candidate (in-flight Seal awaiting attestations)
// ────────────────────────────────────────────────────────────────

export async function getCandidate(): Promise<SealCandidate | null> {
  try {
    const raw = await rawGetWithFallback<SealCandidate | string>(CANDIDATE_KEY);
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
    mirrorRawSet(CANDIDATE_KEY, candidate);
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
    mirrorRawDel(CANDIDATE_KEY);
  } catch (err) {
    console.warn('[vault-v2:store] clearCandidate failed:', err instanceof Error ? err.message : err);
  }
}
