import { getGiMode } from './mode';

type GIInput = {
  zeusScores: number[];
  freshness: 'fresh' | 'degraded' | 'stale';
  tripwire: 'none' | 'watch' | 'elevated';
  activeAgents: number;
};

function avg(values: number[]) {
  if (!values.length) return 0.5;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function computeGI(input: GIInput) {
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
    timestamp: new Date().toISOString(),
  };
}
