type FreshnessState = 'fresh' | 'degraded' | 'stale';
type WatchMode = 'official' | 'interpolated' | 'stale' | 'degraded';
type StressStatus = 'nominal' | 'watch' | 'stressed' | 'critical';

type DebtRow = {
  record_date: string;
  debt_held_public_amt: string;
  intragov_hold_amt: string;
  tot_pub_debt_out_amt: string;
};

export type TreasuryHistoryWindow = '30d' | '90d' | '1y';
export type TreasuryHistorySeries = 'totalDebt' | 'debtHeldPublic' | 'velocity';

export type TreasuryHistoryPoint = {
  date: string;
  timestamp: string;
  value: number;
};

export type TreasuryCompositionItem = {
  id: string;
  label: string;
  value: number;
  share: number;
  canonicalOrder: number;
  timestamp: string;
};

type TreasuryCompositionPayload = {
  asOf: string;
  timestamp: string;
  categories: TreasuryCompositionItem[];
};

type TreasuryHistoryPayload = {
  series: TreasuryHistorySeries;
  window: TreasuryHistoryWindow;
  points: TreasuryHistoryPoint[];
};

type TreasuryApiResponse = {
  data?: DebtRow[];
};

export type TreasuryWatchSnapshot = {
  mode: WatchMode;
  source: string;
  dataset: string;
  recordDate: string;
  officialUpdatedAt: string;
  totalDebt: number;
  debtHeldPublic: number;
  intragovernmentalHoldings: number;
  delta1d: number;
  delta7dAvg: number;
  ratePerSecond: number;
  freshness: {
    state: FreshnessState;
    secondsSinceOfficialUpdate: number;
  };
  interpolation: {
    active: boolean;
    baseValue: number;
    baseTimestamp: string;
    method: string;
  };
  stress: {
    status: StressStatus;
    reasons: string[];
  };
  provenance: {
    official: boolean;
    estimatedDisplayValue: boolean;
    fallbackUsed: string | null;
  };
};

const TREASURY_URL =
  'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny?sort=-record_date&page[size]=2';

const CACHE_TTL_MS = 15 * 60 * 1000;

function getHistoryUrl(window: TreasuryHistoryWindow) {
  const pageSize = window === '30d' ? 40 : window === '90d' ? 100 : 370;

  return `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny?sort=-record_date&page[size]=${pageSize}`;
}

let cachedSnapshot: TreasuryWatchSnapshot | null = null;
let cachedAt = 0;

const compositionCache = new Map<string, { at: number; payload: TreasuryCompositionPayload }>();
const historyCache = new Map<string, { at: number; payload: TreasuryHistoryPayload }>();

function canonicalTimestamp(recordDate: string) {
  return new Date(`${recordDate}T00:00:00.000Z`).toISOString();
}

function canonicalSortRows(rows: DebtRow[]) {
  const deduped = new Map<string, DebtRow>();
  for (const row of rows) {
    if (!deduped.has(row.record_date)) {
      deduped.set(row.record_date, row);
    }
  }

  return [...deduped.values()].sort((a, b) => {
    const aTs = new Date(canonicalTimestamp(a.record_date)).getTime();
    const bTs = new Date(canonicalTimestamp(b.record_date)).getTime();
    return aTs - bTs;
  });
}

const CANONICAL_COMPOSITION_ORDER: Record<string, number> = {
  'Debt Held by Public': 1,
  'Intragovernmental Holdings': 2,
};

function canonicalSortComposition(items: TreasuryCompositionItem[]) {
  return [...items].sort((a, b) => {
    if (a.canonicalOrder !== b.canonicalOrder) return a.canonicalOrder - b.canonicalOrder;
    if (a.timestamp !== b.timestamp) return a.timestamp.localeCompare(b.timestamp);
    return a.label.localeCompare(b.label);
  });
}

function toNumber(value: string | undefined) {
  const parsed = Number(value ?? '0');
  return Number.isFinite(parsed) ? parsed : 0;
}

function classifyFreshness(recordDate: string): FreshnessState {
  const record = new Date(`${recordDate}T00:00:00Z`).getTime();
  const now = Date.now();
  const ageDays = (now - record) / (24 * 60 * 60 * 1000);

  if (ageDays <= 2) return 'fresh';
  if (ageDays <= 5) return 'degraded';
  return 'stale';
}

function classifyStress(delta1d: number, delta7dAvg: number, freshness: FreshnessState) {
  const reasons: string[] = [];
  let status: StressStatus = 'nominal';

  if (freshness !== 'fresh') {
    reasons.push('source_freshness_not_fresh');
    status = 'watch';
  }

  if (delta7dAvg > 0 && delta1d > delta7dAvg * 1.15) {
    reasons.push('debt_velocity_elevated');
    status = status === 'nominal' ? 'stressed' : status;
  }

  if (delta7dAvg > 0 && delta1d > delta7dAvg * 1.35) {
    reasons.push('velocity_far_above_7d_avg');
    status = 'critical';
  }

  return { status, reasons };
}

function buildSnapshot(rows: DebtRow[]): TreasuryWatchSnapshot {
  const sorted = [...rows];
  const latest = sorted[0];
  const prior = sorted[1] ?? sorted[0];

  const totalDebt = toNumber(latest.tot_pub_debt_out_amt);
  const debtHeldPublic = toNumber(latest.debt_held_public_amt);
  const intragovernmentalHoldings = toNumber(latest.intragov_hold_amt);

  const priorDebt = toNumber(prior.tot_pub_debt_out_amt);
  const delta1d = Math.max(0, totalDebt - priorDebt);
  const delta7dAvg = delta1d;

  const latestDate = new Date(`${latest.record_date}T00:00:00Z`).getTime();
  const priorDate = new Date(`${prior.record_date}T00:00:00Z`).getTime();
  const deltaSeconds = Math.max(86400, (latestDate - priorDate) / 1000 || 86400);
  const ratePerSecond = delta1d / deltaSeconds;

  const officialUpdatedAt = new Date().toISOString();
  const freshnessState = classifyFreshness(latest.record_date);
  const secondsSinceOfficialUpdate = 0;
  const interpolationActive = freshnessState === 'fresh';

  const stress = classifyStress(delta1d, delta7dAvg, freshnessState);

  return {
    mode: interpolationActive ? 'interpolated' : freshnessState === 'stale' ? 'stale' : 'official',
    source: 'Treasury Fiscal Data',
    dataset: 'Debt to the Penny',
    recordDate: latest.record_date,
    officialUpdatedAt,
    totalDebt,
    debtHeldPublic,
    intragovernmentalHoldings,
    delta1d,
    delta7dAvg,
    ratePerSecond,
    freshness: {
      state: freshnessState,
      secondsSinceOfficialUpdate,
    },
    interpolation: {
      active: interpolationActive,
      baseValue: totalDebt,
      baseTimestamp: officialUpdatedAt,
      method: 'daily-linear',
    },
    stress,
    provenance: {
      official: true,
      estimatedDisplayValue: interpolationActive,
      fallbackUsed: null,
    },
  };
}

function buildHistoryPayload(
  rows: DebtRow[],
  window: TreasuryHistoryWindow,
  series: TreasuryHistorySeries,
): TreasuryHistoryPayload {
  const sorted = canonicalSortRows(rows);

  const points: TreasuryHistoryPoint[] = sorted.map((row, index) => {
    let value = toNumber(row.tot_pub_debt_out_amt);

    if (series === 'debtHeldPublic') {
      value = toNumber(row.debt_held_public_amt);
    }

    if (series === 'velocity') {
      if (index === 0) {
        value = 0;
      } else {
        const prev = sorted[index - 1];
        value = Math.max(0, toNumber(row.tot_pub_debt_out_amt) - toNumber(prev.tot_pub_debt_out_amt));
      }
    }

    return {
      date: row.record_date,
      timestamp: canonicalTimestamp(row.record_date),
      value,
    };
  });

  return {
    series,
    window,
    points,
  };
}

function buildCompositionPayload(snapshot: TreasuryWatchSnapshot): TreasuryCompositionPayload {
  const timestamp = canonicalTimestamp(snapshot.recordDate);
  const total = Math.max(1, snapshot.totalDebt);

  const categories: TreasuryCompositionItem[] = [
    {
      id: 'debt-held-public',
      label: 'Debt Held by Public',
      value: snapshot.debtHeldPublic,
      share: snapshot.debtHeldPublic / total,
      canonicalOrder: CANONICAL_COMPOSITION_ORDER['Debt Held by Public'],
      timestamp,
    },
    {
      id: 'intragovernmental-holdings',
      label: 'Intragovernmental Holdings',
      value: snapshot.intragovernmentalHoldings,
      share: snapshot.intragovernmentalHoldings / total,
      canonicalOrder: CANONICAL_COMPOSITION_ORDER['Intragovernmental Holdings'],
      timestamp,
    },
  ];

  return {
    asOf: snapshot.recordDate,
    timestamp,
    categories: canonicalSortComposition(categories),
  };
}

export async function getTreasuryWatchSnapshot(): Promise<TreasuryWatchSnapshot> {
  const now = Date.now();
  if (cachedSnapshot && now - cachedAt < CACHE_TTL_MS) {
    return cachedSnapshot;
  }

  try {
    const res = await fetch(TREASURY_URL, {
      headers: {
        Accept: 'application/json',
      },
      next: { revalidate: 900 },
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Treasury API returned ${res.status}`);
    }

    const json = (await res.json()) as TreasuryApiResponse;
    const rows = json.data ?? [];
    if (rows.length === 0) {
      throw new Error('Treasury API returned no debt rows');
    }

    const snapshot = buildSnapshot(rows);
    cachedSnapshot = snapshot;
    cachedAt = now;
    return snapshot;
  } catch (error) {
    if (cachedSnapshot) {
      return {
        ...cachedSnapshot,
        mode: 'degraded',
        interpolation: {
          ...cachedSnapshot.interpolation,
          active: false,
        },
        provenance: {
          official: false,
          estimatedDisplayValue: false,
          fallbackUsed: 'last-good-cache',
        },
      };
    }

    throw error instanceof Error ? error : new Error('Unable to build Treasury snapshot');
  }
}

export async function getTreasuryHistory(
  window: TreasuryHistoryWindow = '30d',
  series: TreasuryHistorySeries = 'velocity',
): Promise<TreasuryHistoryPayload> {
  const key = `${window}:${series}`;
  const now = Date.now();
  const cached = historyCache.get(key);
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.payload;
  }

  const res = await fetch(getHistoryUrl(window), {
    headers: {
      Accept: 'application/json',
    },
    next: { revalidate: 900 },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Treasury history API returned ${res.status}`);
  }

  const json = (await res.json()) as TreasuryApiResponse;
  const rows = json.data ?? [];
  if (rows.length === 0) {
    throw new Error('Treasury history API returned no rows');
  }

  const payload = buildHistoryPayload(rows, window, series);
  historyCache.set(key, { at: now, payload });
  return payload;
}

export async function getTreasuryComposition(): Promise<TreasuryCompositionPayload> {
  const snapshot = await getTreasuryWatchSnapshot();
  const key = snapshot.recordDate;
  const now = Date.now();
  const cached = compositionCache.get(key);

  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.payload;
  }

  const payload = buildCompositionPayload(snapshot);
  compositionCache.set(key, { at: now, payload });
  return payload;
}
