import { kvGet, kvSet } from '@/lib/kv/store';

const SAVEPOINT_TTL_SECONDS = 60 * 60 * 24;

export type SavepointMeta = {
  key: string;
  status: 'live' | 'saved' | 'none';
  saved_at: string | null;
  saved_count: number;
  live_count: number;
  reason: string | null;
};

type SavedPayload<T> = {
  payload: T;
  saved_at: string;
  count: number;
};

function stableHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function chamberSavepointKey(chamber: string, scope: Record<string, unknown>): string {
  const stableScope = JSON.stringify(
    Object.keys(scope)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = scope[key];
        return acc;
      }, {}),
  );
  return `chamber:savepoint:${chamber}:${stableHash(stableScope)}`;
}

export async function resolveChamberSavepoint<T>(args: {
  key: string;
  livePayload: T;
  liveCount: number;
  authoritativeReset?: boolean;
  minimumUsefulCount?: number;
}): Promise<{ payload: T; meta: SavepointMeta }> {
  const saved = await kvGet<SavedPayload<T>>(args.key);
  const minimumUsefulCount = args.minimumUsefulCount ?? 1;
  const savedCount = typeof saved?.count === 'number' ? saved.count : 0;
  const liveCount = Math.max(0, Math.floor(args.liveCount));

  if (
    saved &&
    !args.authoritativeReset &&
    savedCount >= minimumUsefulCount &&
    liveCount < savedCount
  ) {
    return {
      payload: {
        ...(saved.payload as Record<string, unknown>),
        savepoint: {
          key: args.key,
          status: 'saved',
          saved_at: saved.saved_at,
          saved_count: savedCount,
          live_count: liveCount,
          reason: 'live_payload_thinner_than_saved_state',
        },
      } as T,
      meta: {
        key: args.key,
        status: 'saved',
        saved_at: saved.saved_at,
        saved_count: savedCount,
        live_count: liveCount,
        reason: 'live_payload_thinner_than_saved_state',
      },
    };
  }

  if (liveCount >= savedCount || liveCount >= minimumUsefulCount || args.authoritativeReset) {
    const savedAt = new Date().toISOString();
    await kvSet<SavedPayload<T>>(args.key, { payload: args.livePayload, saved_at: savedAt, count: liveCount }, SAVEPOINT_TTL_SECONDS);
    return {
      payload: {
        ...(args.livePayload as Record<string, unknown>),
        savepoint: {
          key: args.key,
          status: 'live',
          saved_at: savedAt,
          saved_count: liveCount,
          live_count: liveCount,
          reason: null,
        },
      } as T,
      meta: {
        key: args.key,
        status: 'live',
        saved_at: savedAt,
        saved_count: liveCount,
        live_count: liveCount,
        reason: null,
      },
    };
  }

  return {
    payload: {
      ...(args.livePayload as Record<string, unknown>),
      savepoint: {
        key: args.key,
        status: 'none',
        saved_at: null,
        saved_count: savedCount,
        live_count: liveCount,
        reason: 'no_saved_state_and_live_payload_below_minimum',
      },
    } as T,
    meta: {
      key: args.key,
      status: 'none',
      saved_at: null,
      saved_count: savedCount,
      live_count: liveCount,
      reason: 'no_saved_state_and_live_payload_below_minimum',
    },
  };
}
