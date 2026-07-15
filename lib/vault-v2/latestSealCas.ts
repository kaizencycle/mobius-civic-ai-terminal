/**
 * Atomic compare-and-set for vault:seal:latest (C-373 correctness patch).
 */

import type { Redis } from '@upstash/redis';

export const LATEST_SEAL_KEY = 'vault:seal:latest';
export const CAS_NULL_SENTINEL = '__NULL__';

/**
 * Lua: compare KEYS[1] to ARGV[1] (or absent when ARGV[1] is __NULL__), then SET ARGV[2].
 * Returns {1, newValue} on success or {0, actualValue} on mismatch.
 */
export const LATEST_SEAL_CAS_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if ARGV[1] == '${CAS_NULL_SENTINEL}' then
  if current then
    return {0, current}
  end
else
  if current ~= ARGV[1] then
    return {0, current or ''}
  end
end
redis.call('SET', KEYS[1], ARGV[2])
return {1, ARGV[2]}
`;

export type LatestSealCasResult = { ok: boolean; actual: string | null };

function normalizeCasActual(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  return String(raw);
}

export async function compareAndSetLatestSealIdOnRedis(
  redis: Pick<Redis, 'eval'>,
  expectedCurrent: string | null,
  nextSealId: string,
): Promise<LatestSealCasResult> {
  const expectedArg = expectedCurrent === null ? CAS_NULL_SENTINEL : expectedCurrent;
  const result = (await redis.eval(LATEST_SEAL_CAS_SCRIPT, [LATEST_SEAL_KEY], [expectedArg, nextSealId])) as
    | [number, string]
    | null;

  if (!result || !Array.isArray(result) || result.length < 2) {
    return { ok: false, actual: null };
  }

  const [status, actual] = result;
  if (status === 1) {
    return { ok: true, actual: nextSealId };
  }
  return { ok: false, actual: normalizeCasActual(actual) };
}
