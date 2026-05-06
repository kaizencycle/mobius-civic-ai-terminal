import type {
  EpiconNormalizedPrSignal,
  EpiconPrSignalInput,
} from './types';

export function normalizePrSignal(
  input: EpiconPrSignalInput,
): EpiconNormalizedPrSignal {
  const totalChanges = input.additions + input.deletions;

  const changeVolume =
    totalChanges > 500
      ? 'large'
      : totalChanges > 100
        ? 'medium'
        : 'small';

  return {
    ...input,
    totalChanges,
    changeVolume,
    sensitivePathCount: input.sensitivePaths.length,
  };
}
