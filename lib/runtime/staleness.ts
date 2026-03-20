export function getStalenessStatus(lastRun: string) {
  const now = Date.now();
  const last = new Date(lastRun).getTime();

  const diff = (now - last) / 1000;

  if (diff < 30) {
    return { status: 'fresh' as const, seconds: diff };
  }

  if (diff < 120) {
    return { status: 'degraded' as const, seconds: diff };
  }

  return { status: 'stale' as const, seconds: diff };
}
