import type { CanonicalMacroOverlay } from './macro-overlay';

type Json = Record<string, any>;

function canonicalTimestamp(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pick(obj: Json, keys: string[]): unknown {
  for (const key of keys) {
    if (key in obj) return obj[key];
  }
  return undefined;
}

function getNested(obj: Json, path: Array<string | number>): unknown {
  let current: any = obj;
  for (const part of path) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

async function fetchJson(url: string | null): Promise<Json | null> {
  if (!url) return null;

  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 60 },
      cache: 'no-store',
    });

    if (!res.ok) return null;
    return (await res.json()) as Json;
  } catch {
    return null;
  }
}

function normalizeGenericPayload(
  payload: Json | null,
  provider: string,
  sourceFallback = 'Macro Bridge',
): CanonicalMacroOverlay {
  if (!payload) {
    return {
      asOf: null,
      source: sourceFallback,
      provider,
      tenYearYield: null,
      thirtyYearYield: null,
      dxy: null,
      vix: null,
      available: false,
      degraded: true,
    };
  }

  const tenYearYield = toNumberOrNull(
    pick(payload, ['tenYearYield', 'us10y', 'tenYear', 'ust10y']) ??
      getNested(payload, ['rates', 'tenYear']) ??
      getNested(payload, ['rates', 'us10y']),
  );

  const thirtyYearYield = toNumberOrNull(
    pick(payload, ['thirtyYearYield', 'us30y', 'thirtyYear', 'ust30y']) ??
      getNested(payload, ['rates', 'thirtyYear']) ??
      getNested(payload, ['rates', 'us30y']),
  );

  const dxy = toNumberOrNull(
    pick(payload, ['dxy', 'dollarIndex']) ??
      getNested(payload, ['dollar', 'dxy']) ??
      getNested(payload, ['fx', 'dxy']),
  );

  const vix = toNumberOrNull(
    pick(payload, ['vix', 'volatility']) ??
      getNested(payload, ['volatility', 'vix']) ??
      getNested(payload, ['risk', 'vix']),
  );

  const available = [tenYearYield, thirtyYearYield, dxy, vix].some((v) => v !== null);

  return {
    asOf:
      canonicalTimestamp(pick(payload, ['asOf', 'timestamp', 'updatedAt'])) ??
      canonicalTimestamp(getNested(payload, ['meta', 'asOf'])),
    source: String(pick(payload, ['source']) ?? sourceFallback),
    provider,
    tenYearYield,
    thirtyYearYield,
    dxy,
    vix,
    available,
    degraded: !available,
  };
}

function extractFredLastValue(payload: Json | null): { value: number | null; asOf: string | null } {
  if (!payload) return { value: null, asOf: null };

  const observations = Array.isArray(payload.observations) ? payload.observations : [];
  for (let i = observations.length - 1; i >= 0; i -= 1) {
    const row = observations[i];
    const value = toNumberOrNull(row?.value);
    if (value !== null) {
      return {
        value,
        asOf: canonicalTimestamp(row?.date ?? payload.realtime_end ?? payload.realtime_start),
      };
    }
  }

  return {
    value: null,
    asOf: canonicalTimestamp(payload.realtime_end ?? payload.realtime_start),
  };
}

function extractPolygonLikeValue(payload: Json | null): { value: number | null; asOf: string | null } {
  if (!payload) return { value: null, asOf: null };

  const candidates = [
    pick(payload, ['value', 'price', 'close', 'c', 'last']),
    getNested(payload, ['results', 0, 'value']),
    getNested(payload, ['results', 0, 'price']),
    getNested(payload, ['results', 0, 'close']),
    getNested(payload, ['results', 'value']),
    getNested(payload, ['last', 'value']),
    getNested(payload, ['last', 'price']),
    getNested(payload, ['snapshot', 'value']),
    getNested(payload, ['snapshot', 'price']),
  ];

  for (const candidate of candidates) {
    const value = toNumberOrNull(candidate);
    if (value !== null) {
      return {
        value,
        asOf: canonicalTimestamp(
          pick(payload, ['updated', 'updatedAt', 'timestamp']) ??
            getNested(payload, ['results', 0, 'timestamp']) ??
            getNested(payload, ['last', 'timestamp']),
        ),
      };
    }
  }

  return { value: null, asOf: canonicalTimestamp(pick(payload, ['updated', 'updatedAt', 'timestamp'])) };
}

async function loadGenericProvider(): Promise<CanonicalMacroOverlay> {
  const url = process.env.MARKET_MACRO_BRIDGE_URL ?? null;
  const payload = await fetchJson(url);
  return normalizeGenericPayload(payload, 'generic', 'Macro Bridge');
}

async function loadManualBridgeProvider(): Promise<CanonicalMacroOverlay> {
  const url = process.env.MARKET_MACRO_BRIDGE_URL ?? null;
  const payload = await fetchJson(url);
  return normalizeGenericPayload(payload, 'manual-bridge', 'Manual Bridge');
}

async function loadFredProvider(): Promise<CanonicalMacroOverlay> {
  const [tenYearPayload, thirtyYearPayload, dxyPayload, vixPayload] = await Promise.all([
    fetchJson(process.env.FRED_10Y_URL ?? null),
    fetchJson(process.env.FRED_30Y_URL ?? null),
    fetchJson(process.env.FRED_DXY_URL ?? null),
    fetchJson(process.env.FRED_VIX_URL ?? null),
  ]);

  const tenYear = extractFredLastValue(tenYearPayload);
  const thirtyYear = extractFredLastValue(thirtyYearPayload);
  const dxy = extractFredLastValue(dxyPayload);
  const vix = extractFredLastValue(vixPayload);

  const asOf = [tenYear.asOf, thirtyYear.asOf, dxy.asOf, vix.asOf].find(Boolean) ?? null;
  const available = [tenYear.value, thirtyYear.value, dxy.value, vix.value].some((v) => v !== null);

  return {
    asOf,
    source: 'FRED bridge',
    provider: 'fred',
    tenYearYield: tenYear.value,
    thirtyYearYield: thirtyYear.value,
    dxy: dxy.value,
    vix: vix.value,
    available,
    degraded: !available,
  };
}

async function loadPolygonProvider(): Promise<CanonicalMacroOverlay> {
  const [tenYearPayload, thirtyYearPayload, dxyPayload, vixPayload] = await Promise.all([
    fetchJson(process.env.POLYGON_10Y_URL ?? null),
    fetchJson(process.env.POLYGON_30Y_URL ?? null),
    fetchJson(process.env.POLYGON_DXY_URL ?? null),
    fetchJson(process.env.POLYGON_VIX_URL ?? null),
  ]);

  const tenYear = extractPolygonLikeValue(tenYearPayload);
  const thirtyYear = extractPolygonLikeValue(thirtyYearPayload);
  const dxy = extractPolygonLikeValue(dxyPayload);
  const vix = extractPolygonLikeValue(vixPayload);

  const asOf = [tenYear.asOf, thirtyYear.asOf, dxy.asOf, vix.asOf].find(Boolean) ?? null;
  const available = [tenYear.value, thirtyYear.value, dxy.value, vix.value].some((v) => v !== null);

  return {
    asOf,
    source: 'Polygon bridge',
    provider: 'polygon',
    tenYearYield: tenYear.value,
    thirtyYearYield: thirtyYear.value,
    dxy: dxy.value,
    vix: vix.value,
    available,
    degraded: !available,
  };
}

export async function loadMacroProvider(providerName: string): Promise<CanonicalMacroOverlay> {
  switch (providerName) {
    case 'manual-bridge':
      return loadManualBridgeProvider();
    case 'fred':
      return loadFredProvider();
    case 'polygon':
      return loadPolygonProvider();
    case 'generic':
    default:
      return loadGenericProvider();
  }
}

export function getSupportedMacroProviders() {
  return ['generic', 'manual-bridge', 'fred', 'polygon'] as const;
}
