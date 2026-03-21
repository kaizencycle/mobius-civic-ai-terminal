export type GIMode = 'green' | 'yellow' | 'red';

export function getGiMode(gi: number): GIMode {
  if (gi >= 0.8) return 'green';
  if (gi >= 0.6) return 'yellow';
  return 'red';
}

export const giModeConfig = {
  green: {
    label: 'Expansion',
    rewardMultiplier: 1.0,
    burnMultiplier: 1.0,
    minStakeOptions: [0, 1, 3],
    visibilityThreshold: 0.35,
  },
  yellow: {
    label: 'Stabilization',
    rewardMultiplier: 1.5,
    burnMultiplier: 1.0,
    minStakeOptions: [1, 3, 5],
    visibilityThreshold: 0.5,
  },
  red: {
    label: 'Defense',
    rewardMultiplier: 2.0,
    burnMultiplier: 1.5,
    minStakeOptions: [3, 5, 8],
    visibilityThreshold: 0.7,
  },
} as const;
