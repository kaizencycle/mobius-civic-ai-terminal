// C-356 — Upstash budget-suspension error detection.
// Classify an unknown thrown value as a budget-cap suspension so callers
// can degrade gracefully instead of returning 5xx.

const BUDGET_SUSPENSION_MARKERS = [
  'exceeded the defined budget limit',
  'database has been suspended',
] as const;

export function isBudgetSuspensionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return BUDGET_SUSPENSION_MARKERS.some((m) => msg.includes(m));
}

export const isKvSuspended = isBudgetSuspensionError;
