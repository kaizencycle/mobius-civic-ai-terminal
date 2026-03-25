import { getTreasuryDeepComposition } from './deep-composition';

type SchedulesRow = {
  record_date: string;
  debt_holder_type: string;
  security_class1_desc?: string;
  security_class2_desc: string;
  principal_mil_amt?: string;
};

type SchedulesApiResponse = {
  data?: SchedulesRow[];
};

export type TreasuryCrossCheckLine = {
  id: string;
  parent: string;
  label: string;
  mspdTotal: number;
  schedulesTotal: number;
  absDiff: number;
  pctDiff: number;
  status: 'aligned' | 'drift' | 'missing';
};

type TreasuryCrossCheckPayload = {
  asOf: string;
  source: string;
  datasets: {
    primary: string;
    secondary: string;
  };
  status: 'aligned' | 'watch' | 'drift' | 'partial';
  tolerancePct: number;
  toleranceUsd: number;
  summary: {
    mspdTotal: number;
    schedulesTotal: number;
    absDiff: number;
    pctDiff: number;
  };
  lines: TreasuryCrossCheckLine[];
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const TREASURY_SCHEDULES_MONTH_URL =
  process.env.TREASURY_SCHEDULES_MONTH_URL ??
  'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/debt/schedules_federal_debt_by_month?sort=-record_date&page[size]=1000';

const TOLERANCE_PCT = 0.005;
const TOLERANCE_USD = 5_000_000_000;

let cachedPayload: TreasuryCrossCheckPayload | null = null;
let cachedAt = 0;

function toNumberMillions(value: string | undefined) {
  const parsed = Number(value ?? '0');
  return Number.isFinite(parsed) ? parsed * 1_000_000 : 0;
}

function canonicalParent(value?: string) {
  const lower = (value ?? '').toLowerCase();
  if (lower.includes('marketable')) return 'Marketable';
  if (lower.includes('nonmarketable')) return 'Nonmarketable';
  return 'Other';
}

function canonicalLabel(parent: string, value?: string) {
  const lower = (value ?? '').trim().toLowerCase();

  if (parent === 'Marketable') {
    if (lower.includes('bill')) return 'Treasury Bills';
    if (lower.includes('note')) return 'Treasury Notes';
    if (lower.includes('bond')) return 'Treasury Bonds';
    if (lower.includes('inflation') || lower.includes('tips')) return 'TIPS';
    if (lower.includes('floating')) return 'Floating Rate Notes';
  }

  if (parent === 'Nonmarketable') {
    if (lower.includes('saving')) return 'U.S. Savings Securities';
    if (lower.includes('state and local')) return 'State and Local Government Series';
    if (lower.includes('government account')) return 'Government Account Series';
  }

  return 'Other';
}

function canonicalSort<T extends { parent: string; label: string }>(items: T[]) {
  const order = [
    'Marketable',
    'Treasury Bills',
    'Treasury Notes',
    'Treasury Bonds',
    'TIPS',
    'Floating Rate Notes',
    'Nonmarketable',
    'U.S. Savings Securities',
    'State and Local Government Series',
    'Government Account Series',
    'Other',
  ];

  const rank = new Map(order.map((item, index) => [item, index + 1]));

  return [...items].sort((a, b) => {
    const aRank = rank.get(a.label) ?? rank.get(a.parent) ?? 999;
    const bRank = rank.get(b.label) ?? rank.get(b.parent) ?? 999;
    if (aRank !== bRank) return aRank - bRank;
    if (a.parent !== b.parent) return a.parent.localeCompare(b.parent);
    return a.label.localeCompare(b.label);
  });
}

function compareLine(mspdTotal: number, schedulesTotal: number) {
  const absDiff = Math.abs(mspdTotal - schedulesTotal);
  const pctDiff = mspdTotal > 0 ? absDiff / mspdTotal : 0;
  const aligned = absDiff <= TOLERANCE_USD || pctDiff <= TOLERANCE_PCT;
  return {
    absDiff,
    pctDiff,
    status: aligned ? ('aligned' as const) : ('drift' as const),
  };
}

export async function getTreasuryCrossCheck(): Promise<TreasuryCrossCheckPayload> {
  const now = Date.now();
  if (cachedPayload && now - cachedAt < CACHE_TTL_MS) {
    return cachedPayload;
  }

  const deep = await getTreasuryDeepComposition();

  const res = await fetch(TREASURY_SCHEDULES_MONTH_URL, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 21_600 },
    cache: 'no-store',
  });

  if (!res.ok) {
    if (cachedPayload) return { ...cachedPayload, status: 'partial' };
    throw new Error(`Treasury schedules API returned ${res.status}`);
  }

  const json = (await res.json()) as SchedulesApiResponse;
  const rows = json.data ?? [];
  if (rows.length === 0) {
    if (cachedPayload) return { ...cachedPayload, status: 'partial' };
    throw new Error('Treasury schedules API returned no rows');
  }

  const latestDate = rows[0].record_date;
  const latestRows = rows.filter((row) => row.record_date === latestDate);

  const schedulesMap = new Map<string, number>();

  for (const row of latestRows) {
    const parent = canonicalParent(row.security_class1_desc || row.debt_holder_type);
    const label = canonicalLabel(parent, row.security_class2_desc);
    const key = `${parent}:${label}`;
    const prev = schedulesMap.get(key) ?? 0;
    schedulesMap.set(key, prev + toNumberMillions(row.principal_mil_amt));
  }

  const lines: TreasuryCrossCheckLine[] = deep.categories.map((item) => {
    const key = `${item.parent}:${item.label}`;
    const schedulesTotal = schedulesMap.get(key) ?? 0;

    if (schedulesTotal === 0) {
      return {
        id: key.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        parent: item.parent,
        label: item.label,
        mspdTotal: item.valueTotal,
        schedulesTotal,
        absDiff: item.valueTotal,
        pctDiff: 1,
        status: 'missing',
      };
    }

    const diff = compareLine(item.valueTotal, schedulesTotal);

    return {
      id: key.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      parent: item.parent,
      label: item.label,
      mspdTotal: item.valueTotal,
      schedulesTotal,
      absDiff: diff.absDiff,
      pctDiff: diff.pctDiff,
      status: diff.status,
    };
  });

  const sortedLines = canonicalSort(lines);

  const mspdTotal = sortedLines.reduce((sum, line) => sum + line.mspdTotal, 0);
  const schedulesTotal = sortedLines.reduce((sum, line) => sum + line.schedulesTotal, 0);
  const absDiff = Math.abs(mspdTotal - schedulesTotal);
  const pctDiff = mspdTotal > 0 ? absDiff / mspdTotal : 0;

  const hasMissing = sortedLines.some((line) => line.status === 'missing');
  const hasDrift = sortedLines.some((line) => line.status === 'drift');

  const payload: TreasuryCrossCheckPayload = {
    asOf: deep.asOf,
    source: 'Treasury Fiscal Data',
    datasets: {
      primary: 'Monthly Statement of the Public Debt',
      secondary: 'Schedules of Federal Debt',
    },
    status: hasDrift ? 'drift' : hasMissing ? 'partial' : pctDiff > TOLERANCE_PCT ? 'watch' : 'aligned',
    tolerancePct: TOLERANCE_PCT,
    toleranceUsd: TOLERANCE_USD,
    summary: {
      mspdTotal,
      schedulesTotal,
      absDiff,
      pctDiff,
    },
    lines: sortedLines,
  };

  cachedPayload = payload;
  cachedAt = now;
  return payload;
}
