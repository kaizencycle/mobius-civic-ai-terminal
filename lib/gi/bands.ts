// C-328: Single source of truth for GI band definitions.
// All consumers (mode.ts, attest.ts, gi-gate.yml) derive from here.

export type GIMode = 'green' | 'yellow' | 'red';
export type Posture = 'confident' | 'cautionary' | 'stressed' | 'degraded';

export const GI_BANDS = {
  green: 0.80,
  yellow: 0.60,
} as const;

// Posture thresholds within bands
export const GI_POSTURE_BANDS = {
  confident: { gi: 0.80, mode: 'green' as GIMode },
  cautionary: { gi: 0.74, mode: 'yellow' as GIMode },
  stressed: { gi: 0.60, mode: 'yellow' as GIMode },
} as const;

export function getGiMode(gi: number): GIMode {
  if (gi >= GI_BANDS.green) return 'green';
  if (gi >= GI_BANDS.yellow) return 'yellow';
  return 'red';
}

export function getSealingPosture(gi: number, mode: GIMode): Posture {
  if (gi >= GI_POSTURE_BANDS.confident.gi && mode === 'green') return 'confident';
  if (gi >= GI_POSTURE_BANDS.cautionary.gi && mode === 'yellow') return 'cautionary';
  if (gi >= GI_POSTURE_BANDS.stressed.gi && mode === 'yellow') return 'stressed';
  return 'degraded';
}
