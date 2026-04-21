/**
 * In-process cache for snapshot-lite hot path (30s fresh, 60s SWR).
 * Cuts repeated MGET + ping traffic for warm Vercel instances / multi-tab users.
 */

type CacheEntry<T> = {
  value: T;
  fetchedAt: number;
  revalidating: boolean;
};

const FRESH_MS = 30_000;
const SWR_MS = 60_000;

const store = new Map<string, CacheEntry<unknown>>();

export async function cachedByKey<T>(key: string, fetcher: () => Promise<T>): Promise<{ value: T; fresh: boolean }> {
  const now = Date.now();
  const entry = store.get(key) as CacheEntry<T> | undefined;

  if (entry) {
    const age = now - entry.fetchedAt;
    if (age < FRESH_MS) {
      return { value: entry.value, fresh: true };
    }
    if (age < SWR_MS && !entry.revalidating) {
      entry.revalidating = true;
      void fetcher()
        .then((value) => {
          store.set(key, { value, fetchedAt: Date.now(), revalidating: false } as CacheEntry<unknown>);
        })
        .catch(() => {
          const cur = store.get(key) as CacheEntry<T> | undefined;
          if (cur === entry) entry.revalidating = false;
        });
      return { value: entry.value, fresh: false };
    }
  }

  const value = await fetcher();
  store.set(key, { value, fetchedAt: now, revalidating: false } as CacheEntry<unknown>);
  return { value, fresh: true };
}
