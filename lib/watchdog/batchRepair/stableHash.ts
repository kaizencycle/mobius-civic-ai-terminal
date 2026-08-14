import { createHash } from 'node:crypto';

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortKeys(record[key]);
    }
    return sorted;
  }
  return value;
}

/** Deterministic JSON serialization (sorted object keys, stable arrays). */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hashObject<T extends Record<string, unknown>>(
  obj: T,
  excludeKeys: string[] = [],
): string {
  const filtered = { ...obj };
  for (const key of excludeKeys) {
    delete filtered[key];
  }
  return sha256Hex(stableStringify(filtered));
}
