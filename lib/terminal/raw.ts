// C-339 PR-C item 8: typed narrowing helpers for untrusted JSON boundaries.
//
// These replace the untyped `raw` parameters in the terminal transform layer.
// Unlike `any` (which disables all checking and silently propagates), these
// helpers force every field read through an explicit runtime narrowing, so a
// malformed upstream payload degrades to a typed fallback instead of injecting
// `undefined`/wrong-typed values deep into the UI.

export type RawRecord = Record<string, unknown>;

/** Coerce an unknown value into an indexable record (empty object if not one). */
export function asRecord(value: unknown): RawRecord {
  return value !== null && typeof value === 'object' ? (value as RawRecord) : {};
}

/** First defined value among the given keys (handles snake/camel aliases). */
export function firstDefined(rec: RawRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (rec[key] !== undefined && rec[key] !== null) return rec[key];
  }
  return undefined;
}

export function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function strOpt(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function numOpt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function bool(value: unknown): boolean {
  return Boolean(value);
}

export function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** Narrow an unknown to one of a fixed set of string literals, else fallback. */
export function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}
