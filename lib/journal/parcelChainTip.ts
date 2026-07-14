/**
 * C-372: KV witness for journal parcel chain tip + flush serialization lock.
 */

import { kvDel, kvGet, kvSet } from '@/lib/kv/store';

const CHAIN_TIP_KEY = 'journal:parcel:chain_tip';
const FLUSH_LOCK_KEY = 'journal:parcel:flush_lock';
const FLUSH_LOCK_TTL_SECONDS = 120;
const FLUSH_LOCK_WAIT_MS = 90_000;

export type ParcelChainTip = {
  parcel_hash: string;
  parcel_path: string;
  seal_id: string;
  branch: string;
  updated_at: string;
};

export async function readParcelChainTip(): Promise<ParcelChainTip | null> {
  return kvGet<ParcelChainTip>(CHAIN_TIP_KEY);
}

export async function writeParcelChainTip(tip: ParcelChainTip): Promise<void> {
  await kvSet(CHAIN_TIP_KEY, tip);
}

export async function mergeRepoAndKvParcelTip(
  repoTipHash: string,
  repoTipPath: string | null,
  kvTip: ParcelChainTip | null,
): Promise<string> {
  if (!kvTip?.parcel_hash || !kvTip.parcel_path) return repoTipHash;
  if (!repoTipPath) return kvTip.parcel_hash;

  const { compareParcelPaths } = await import('../../scripts/lib/parcel-format.mjs');
  return compareParcelPaths(repoTipPath, kvTip.parcel_path) >= 0 ? repoTipHash : kvTip.parcel_hash;
}

export async function withParcelFlushLock<T>(fn: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + FLUSH_LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    const held = await kvGet<{ at: string }>(FLUSH_LOCK_KEY);
    if (!held) {
      await kvSet(FLUSH_LOCK_KEY, { at: new Date().toISOString() }, FLUSH_LOCK_TTL_SECONDS);
      const confirm = await kvGet<{ at: string }>(FLUSH_LOCK_KEY);
      if (confirm) {
        try {
          return await fn();
        } finally {
          await kvDel(FLUSH_LOCK_KEY);
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(
    'journal parcel flush lock timeout — another flush is in progress; retry after open PR merges or lock TTL',
  );
}
