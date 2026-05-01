import { getGiMode, type GIMode } from './mode';

type GIInput = {
  zeusScores: number[];
  freshness: 'fresh' | 'degraded' | 'stale';
  tripwire: 'none' | 'watch' | 'elevated';
  activeAgents: number;
  /** Optional raw signal values for gi_verified multi-source consensus check */
  rawSignalValues?: number[];
};

function avg(values: number[]) {
  // No zeus scores yet: use system-neutral value rather than implying half-quality
  if (!values.length) return 0.74;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function computeGI(input: GIInput): {
  global_integrity: number;
  mode: GIMode;
  terminal_status: 'nominal' | 'stressed' | 'critical';
  primary_driver: string;
  summary: string;
  signals: {
    quality: number;
    freshness: number;
    stability: number;
    system: number;
  };
  gi_verified: boolean;
  gi_verification_method: string;
  timestamp: string;
} {
  const quality = avg(input.zeusScores);

  const freshnessMap = {
    fresh: 1,
    degraded: 0.6,
    stale: 0.3,
  } as const;

  const tripwireMap = {
    none: 1,
    watch: 0.6,
    elevated: 0.3,
  } as const;

  const system =
    input.activeAgents >= 4 ? 1 :
    input.activeAgents >= 2 ? 0.6 :
    0.3;

  const freshness = freshnessMap[input.freshness];
  const stability = tripwireMap[input.tripwire];

  const global_integrity =
    0.35 * quality +
    0.25 * freshness +
    0.20 * stability +
    0.20 * system;

  const mode = getGiMode(global_integrity);

  const terminal_status =
    mode === 'green' ? 'nominal' :
    mode === 'yellow' ? 'stressed' :
    'critical';

  const primary_driver =
    mode === 'red'
      ? 'System instability detected'
      : mode === 'yellow'
        ? 'Moderate signal degradation'
        : 'System operating within normal parameters';

  // gi_verified: true when ≥3 independent signal values agree within ±0.1 band
  // and at least 3 high-confidence signals (>= 0.75) are present.
  const rawVals = input.rawSignalValues ?? input.zeusScores;
  const highConf = rawVals.filter((v) => v >= 0.75);
  let gi_verified = false;
  let gi_verification_method = 'unverified';
  if (highConf.length >= 3) {
    const mean = highConf.reduce((a, b) => a + b, 0) / highConf.length;
    const withinBand = highConf.filter((v) => Math.abs(v - mean) <= 0.1);
    if (withinBand.length >= 3) {
      gi_verified = true;
      gi_verification_method = `multi-source-consensus(${withinBand.length}/${highConf.length})`;
    }
  }

  return {
    global_integrity: Number(global_integrity.toFixed(2)),
    mode,
    terminal_status,
    primary_driver,
    summary: 'GI reflects signal quality, freshness, tripwire stability, and active system health.',
    signals: {
      quality: Number(quality.toFixed(2)),
      freshness: Number(freshness.toFixed(2)),
      stability: Number(stability.toFixed(2)),
      system: Number(system.toFixed(2)),
    },
    gi_verified,
    gi_verification_method,
    timestamp: new Date().toISOString(),
  };
}
