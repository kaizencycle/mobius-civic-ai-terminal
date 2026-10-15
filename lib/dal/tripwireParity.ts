/**
 * lib/dal/tripwireParity.ts — C-465 T6.
 *
 * Pulled out of app/api/terminal/parallel-read/tripwire/route.ts so it is a
 * plain importable function. Next.js route files may only export a fixed set
 * of route fields (GET/POST/config constants/etc.) — an arbitrary named
 * export like this one fails `next build`'s route-shape validation.
 */

export type ParallelReadStatus = 'matched' | 'mismatch' | 'legacy_only' | 'dal_degraded';

/** Pure, no I/O. */
export function getParallelReadTripwireStatus(
  legacyActive: boolean,
  dalActive: boolean | null,
  dalOk: boolean,
): ParallelReadStatus {
  if (!dalOk) return 'dal_degraded';
  if (dalActive === null) return 'legacy_only';
  return legacyActive === dalActive ? 'matched' : 'mismatch';
}
