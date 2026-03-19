export function calculateSourceReliability(
  hits: number,
  misses: number
): number {
  const accuracy = hits / Math.max(1, hits + misses);
  const score = 0.2 + accuracy * 0.7;
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}
