import { getSupportedMacroProviders, loadMacroProvider } from './macro-providers';

export type CanonicalMacroOverlay = {
  asOf: string | null;
  source: string;
  provider: string;
  tenYearYield: number | null;
  thirtyYearYield: number | null;
  dxy: number | null;
  vix: number | null;
  available: boolean;
  degraded: boolean;
};

const CACHE_TTL_MS = 60 * 1000;
const MARKET_MACRO_PROVIDER = process.env.MARKET_MACRO_PROVIDER ?? 'generic';

let cached: { at: number; payload: CanonicalMacroOverlay } | null = null;

export async function getCanonicalMacroOverlay(): Promise<CanonicalMacroOverlay> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.payload;
  }

  const supported = new Set<string>(getSupportedMacroProviders());
  const provider = supported.has(MARKET_MACRO_PROVIDER)
    ? MARKET_MACRO_PROVIDER
    : 'generic';

  const payload = await loadMacroProvider(provider);

  cached = { at: now, payload };
  return payload;
}
