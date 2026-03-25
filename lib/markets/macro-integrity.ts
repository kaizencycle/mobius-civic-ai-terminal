import { getCanonicalMacroOverlay, type CanonicalMacroOverlay } from './macro-overlay';
import { getSupportedMacroProviders, loadMacroProvider } from './macro-providers';

type IntegrityStatus = 'healthy' | 'watch' | 'degraded' | 'critical';

export type MacroIntegrityPulse = {
  timestamp: string;
  activeProvider: string;
  status: IntegrityStatus;
  score: number;
  freshness: {
    asOf: string | null;
    ageMinutes: number | null;
    status: 'fresh' | 'aging' | 'stale' | 'unknown';
  };
  availability: {
    available: boolean;
    degraded: boolean;
  };
  completeness: {
    presentFields: number;
    totalFields: number;
    missing: string[];
  };
  disagreement: {
    checkedProviders: string[];
    signals: {
      tenYearYield: number | null;
      thirtyYearYield: number | null;
      dxy: number | null;
      vix: number | null;
    };
    divergenceFlags: string[];
  };
  notes: string[];
};

const CACHE_TTL_MS = 60 * 1000;
let cached: { at: number; payload: MacroIntegrityPulse } | null = null;

function canonicalNow() {
  return new Date().toISOString();
}

function ageMinutesFrom(asOf: string | null) {
  if (!asOf) return null;
  const ms = new Date().getTime() - new Date(asOf).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round(ms / 60000));
}

function freshnessStatus(ageMinutes: number | null): MacroIntegrityPulse['freshness']['status'] {
  if (ageMinutes === null) return 'unknown';
  if (ageMinutes <= 20) return 'fresh';
  if (ageMinutes <= 120) return 'aging';
  return 'stale';
}

function fieldValueMap(overlay: CanonicalMacroOverlay) {
  return {
    tenYearYield: overlay.tenYearYield,
    thirtyYearYield: overlay.thirtyYearYield,
    dxy: overlay.dxy,
    vix: overlay.vix,
  };
}

function completenessFrom(overlay: CanonicalMacroOverlay) {
  const values = fieldValueMap(overlay);
  const entries = Object.entries(values);
  const missing = entries.filter(([, value]) => value === null).map(([key]) => key);
  return {
    presentFields: entries.length - missing.length,
    totalFields: entries.length,
    missing,
  };
}

function pctDiff(a: number | null, b: number | null) {
  if (a === null || b === null) return null;
  if (a === 0 && b === 0) return 0;
  const base = Math.max(Math.abs(a), Math.abs(b), 0.0001);
  return Math.abs(a - b) / base;
}

function buildDisagreementFlags(active: CanonicalMacroOverlay, peers: CanonicalMacroOverlay[]) {
  const flags: string[] = [];
  const signals = fieldValueMap(active);

  const peerSignals = peers.filter((p) => p.available);

  if (peerSignals.length === 0) {
    return {
      checkedProviders: [],
      signals,
      divergenceFlags: flags,
    };
  }

  const checkField = (
    field: keyof ReturnType<typeof fieldValueMap>,
    threshold: number,
    label: string,
  ) => {
    const activeValue = signals[field];
    if (activeValue === null) return;

    for (const peer of peerSignals) {
      const peerValue = fieldValueMap(peer)[field];
      const diff = pctDiff(activeValue, peerValue);
      if (diff !== null && diff > threshold) {
        flags.push(`${label}_provider_divergence`);
        break;
      }
    }
  };

  checkField('tenYearYield', 0.03, 'ten_year');
  checkField('thirtyYearYield', 0.03, 'thirty_year');
  checkField('dxy', 0.015, 'dxy');
  checkField('vix', 0.12, 'vix');

  return {
    checkedProviders: peerSignals.map((p) => p.provider),
    signals,
    divergenceFlags: [...new Set(flags)],
  };
}

function scorePulse(args: {
  overlay: CanonicalMacroOverlay;
  ageMinutes: number | null;
  completeness: ReturnType<typeof completenessFrom>;
  disagreementFlags: string[];
}) {
  let score = 1.0;
  const notes: string[] = [];

  if (!args.overlay.available) {
    score -= 0.45;
    notes.push('Active macro provider is unavailable.');
  }

  if (args.overlay.degraded) {
    score -= 0.15;
    notes.push('Active macro provider reports degraded state.');
  }

  const fresh = freshnessStatus(args.ageMinutes);
  if (fresh === 'aging') {
    score -= 0.1;
    notes.push('Macro overlay is aging.');
  } else if (fresh === 'stale') {
    score -= 0.25;
    notes.push('Macro overlay is stale.');
  } else if (fresh === 'unknown') {
    score -= 0.15;
    notes.push('Macro overlay has no trustworthy timestamp.');
  }

  const completenessPenalty =
    (args.completeness.totalFields - args.completeness.presentFields) /
    args.completeness.totalFields;
  if (completenessPenalty > 0) {
    score -= completenessPenalty * 0.3;
    notes.push(`Missing macro fields: ${args.completeness.missing.join(', ')}.`);
  }

  if (args.disagreementFlags.length > 0) {
    score -= Math.min(0.25, args.disagreementFlags.length * 0.08);
    notes.push(`Cross-provider disagreement detected: ${args.disagreementFlags.join(', ')}.`);
  }

  score = Math.max(0, Math.min(1, score));

  let status: IntegrityStatus = 'healthy';
  if (score < 0.35) status = 'critical';
  else if (score < 0.6) status = 'degraded';
  else if (score < 0.82) status = 'watch';

  if (notes.length === 0) {
    notes.push('Macro overlay is fresh, complete, and internally coherent.');
  }

  return { score, status, notes };
}

export async function getMacroIntegrityPulse(): Promise<MacroIntegrityPulse> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.payload;
  }

  const active = await getCanonicalMacroOverlay();
  const supported = getSupportedMacroProviders().filter((name) => name !== active.provider);

  const peers = await Promise.all(
    supported.map(async (provider) => {
      try {
        return await loadMacroProvider(provider);
      } catch {
        return {
          asOf: null,
          source: 'macro-provider-pack',
          provider,
          tenYearYield: null,
          thirtyYearYield: null,
          dxy: null,
          vix: null,
          available: false,
          degraded: true,
        } as CanonicalMacroOverlay;
      }
    }),
  );

  const ageMinutes = ageMinutesFrom(active.asOf);
  const completeness = completenessFrom(active);
  const disagreement = buildDisagreementFlags(active, peers);
  const scored = scorePulse({
    overlay: active,
    ageMinutes,
    completeness,
    disagreementFlags: disagreement.divergenceFlags,
  });

  const payload: MacroIntegrityPulse = {
    timestamp: canonicalNow(),
    activeProvider: active.provider,
    status: scored.status,
    score: Number(scored.score.toFixed(3)),
    freshness: {
      asOf: active.asOf,
      ageMinutes,
      status: freshnessStatus(ageMinutes),
    },
    availability: {
      available: active.available,
      degraded: active.degraded,
    },
    completeness,
    disagreement,
    notes: scored.notes,
  };

  cached = { at: now, payload };
  return payload;
}
