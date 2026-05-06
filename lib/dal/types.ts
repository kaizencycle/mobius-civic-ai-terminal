export type DalSource = 'kv' | 'ledger' | 'substrate' | 'echo' | 'github' | 'computed' | 'fallback';

export type DalFreshness = 'live' | 'stale' | 'unknown';

export type DalProvenance = {
  source: DalSource;
  freshness: DalFreshness;
  timestamp: string | null;
  note?: string;
};

export type DalResult<T> = {
  ok: boolean;
  data: T | null;
  provenance: DalProvenance;
  degraded?: boolean;
  error?: string;
};

export function nowIso(): string {
  return new Date().toISOString();
}

export function okDalResult<T>(data: T, provenance: DalProvenance): DalResult<T> {
  return {
    ok: true,
    data,
    provenance,
    degraded: provenance.freshness !== 'live',
  };
}

export function degradedDalResult<T>(args: {
  source: DalSource;
  error: string;
  note?: string;
  data?: T | null;
}): DalResult<T> {
  return {
    ok: false,
    data: args.data ?? null,
    degraded: true,
    error: args.error,
    provenance: {
      source: args.source,
      freshness: 'unknown',
      timestamp: nowIso(),
      note: args.note,
    },
  };
}
