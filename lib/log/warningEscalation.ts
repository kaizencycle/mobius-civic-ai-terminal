/**
 * C-375 — Deduplicated warning escalation (canon-drift-tripwire pattern).
 * Identical warning fingerprints repeating past threshold escalate once until cleared.
 */

import { kvDel, kvGet, kvSet } from '@/lib/kv/store';

const KEY_PREFIX = 'log:warning-escalation:';

export type WarningEscalationResult = {
  count: number;
  escalated: boolean;
  fingerprint: string;
};

export type WarningEscalationState = {
  count: number;
  escalated: boolean;
};

/** Pure counter — testable without KV. */
export function nextWarningEscalationState(
  prev: { count: number; escalated?: boolean } | null | undefined,
  threshold: number,
): WarningEscalationState {
  const count = (prev?.count ?? 0) + 1;
  const escalated = count >= threshold && !prev?.escalated;
  return { count, escalated };
}

export async function recordWarningFingerprint(
  fingerprint: string,
  options?: { threshold?: number; context?: Record<string, unknown> },
): Promise<WarningEscalationResult> {
  const threshold = options?.threshold ?? 6;
  const key = `${KEY_PREFIX}${fingerprint}`;
  const prev = await kvGet<{ count: number; escalated?: boolean }>(key);
  const { count, escalated } = nextWarningEscalationState(prev, threshold);

  await kvSet(
    key,
    { count, escalated: prev?.escalated || escalated, last_at: new Date().toISOString() },
    86400,
  ).catch(() => {});

  if (escalated) {
    console.error(`[log-escalation] ESCALATED fingerprint="${fingerprint}" after ${count} occurrences`, {
      ...options?.context,
      action: 'custodian: open or update GitHub issue with this fingerprint label',
    });
  }

  return { count, escalated, fingerprint };
}

export async function clearWarningFingerprint(fingerprint: string): Promise<void> {
  await kvDel(`${KEY_PREFIX}${fingerprint}`).catch(() => {});
}
