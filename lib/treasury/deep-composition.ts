type MspdRow = {
  record_date: string;
  security_type_desc: string;
  security_class_desc: string;
  debt_held_public_mil_amt: string;
  intragov_hold_mil_amt: string;
};

type MspdApiResponse = {
  data?: MspdRow[];
};

export type TreasuryDeepCompositionItem = {
  id: string;
  parent: string;
  label: string;
  valuePublic: number;
  valueIntragov: number;
  valueTotal: number;
  shareOfTotal: number;
  canonicalOrder: number;
  timestamp: string;
};

type TreasuryDeepCompositionPayload = {
  asOf: string;
  source: string;
  dataset: string;
  canonicalOrder: string[];
  categories: TreasuryDeepCompositionItem[];
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const MSPD_SUMMARY_URL =
  process.env.TREASURY_MSPD_SUMMARY_URL ??
  'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/debt/mspd/mspd_table_1?filter=record_date:lte:2026-02-28&sort=-record_date&page[size]=500';

const CANONICAL_ORDER = [
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
] as const;

const ORDER_MAP: Record<string, number> = Object.fromEntries(
  CANONICAL_ORDER.map((label, index) => [label, index + 1]),
);

let cachedPayload: TreasuryDeepCompositionPayload | null = null;
let cachedAt = 0;

function toNumberMillions(value: string | undefined) {
  const parsed = Number(value ?? '0');
  return Number.isFinite(parsed) ? parsed * 1_000_000 : 0;
}

function canonicalTimestamp(recordDate: string) {
  return new Date(`${recordDate}T00:00:00.000Z`).toISOString();
}

function normalizeLabel(parent: string, label: string) {
  const raw = label.trim();
  const lower = raw.toLowerCase();

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

function canonicalParent(securityTypeDesc: string) {
  const lower = securityTypeDesc.toLowerCase();
  if (lower.includes('marketable')) return 'Marketable';
  if (lower.includes('nonmarketable')) return 'Nonmarketable';
  return 'Other';
}

function canonicalSort(items: TreasuryDeepCompositionItem[]) {
  return [...items].sort((a, b) => {
    if (a.canonicalOrder !== b.canonicalOrder) return a.canonicalOrder - b.canonicalOrder;
    if (a.timestamp !== b.timestamp) return a.timestamp.localeCompare(b.timestamp);
    return a.label.localeCompare(b.label);
  });
}

function buildPayload(rows: MspdRow[]): TreasuryDeepCompositionPayload {
  if (rows.length === 0) {
    throw new Error('MSPD deep composition returned no rows');
  }

  const latestRecordDate = rows[0].record_date;
  const latestRows = rows.filter((row) => row.record_date === latestRecordDate);
  const timestamp = canonicalTimestamp(latestRecordDate);

  const grouped = new Map<
    string,
    {
      parent: string;
      label: string;
      valuePublic: number;
      valueIntragov: number;
    }
  >();

  for (const row of latestRows) {
    const parent = canonicalParent(row.security_type_desc);
    const label = normalizeLabel(parent, row.security_class_desc);
    const key = `${parent}:${label}`;
    const prev = grouped.get(key) ?? {
      parent,
      label,
      valuePublic: 0,
      valueIntragov: 0,
    };

    prev.valuePublic += toNumberMillions(row.debt_held_public_mil_amt);
    prev.valueIntragov += toNumberMillions(row.intragov_hold_mil_amt);
    grouped.set(key, prev);
  }

  const total = [...grouped.values()].reduce((sum, item) => sum + item.valuePublic + item.valueIntragov, 0);

  const categories: TreasuryDeepCompositionItem[] = [...grouped.values()].map((item) => {
    const valueTotal = item.valuePublic + item.valueIntragov;
    return {
      id: `${item.parent}-${item.label}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      parent: item.parent,
      label: item.label,
      valuePublic: item.valuePublic,
      valueIntragov: item.valueIntragov,
      valueTotal,
      shareOfTotal: total > 0 ? valueTotal / total : 0,
      canonicalOrder: ORDER_MAP[item.label] ?? ORDER_MAP[item.parent] ?? ORDER_MAP.Other,
      timestamp,
    };
  });

  return {
    asOf: latestRecordDate,
    source: 'Treasury Fiscal Data',
    dataset: 'Monthly Statement of the Public Debt',
    canonicalOrder: [...CANONICAL_ORDER],
    categories: canonicalSort(categories),
  };
}

export async function getTreasuryDeepComposition(): Promise<TreasuryDeepCompositionPayload> {
  const now = Date.now();
  if (cachedPayload && now - cachedAt < CACHE_TTL_MS) {
    return cachedPayload;
  }

  const res = await fetch(MSPD_SUMMARY_URL, {
    headers: {
      Accept: 'application/json',
    },
    next: { revalidate: 21_600 },
    cache: 'no-store',
  });

  if (!res.ok) {
    if (cachedPayload) return cachedPayload;
    throw new Error(`Treasury MSPD API returned ${res.status}`);
  }

  const json = (await res.json()) as MspdApiResponse;
  const rows = json.data ?? [];
  const payload = buildPayload(rows);
  cachedPayload = payload;
  cachedAt = now;
  return payload;
}
