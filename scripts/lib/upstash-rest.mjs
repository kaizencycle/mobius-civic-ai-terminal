/**
 * Minimal Upstash Redis REST client (zero npm deps).
 * Used by flush-parcel.mjs for offline-capable KV reads.
 */

function kvUrl() {
  return process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? '';
}

function kvToken() {
  return process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? '';
}

export function kvConfigured() {
  return Boolean(kvUrl() && kvToken());
}

async function upstashCommand(command) {
  const url = kvUrl();
  const token = kvToken();
  if (!url || !token) {
    throw new Error('KV_REST_API_URL and KV_REST_API_TOKEN required for parcel flush');
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upstash REST ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  if (json.error) throw new Error(`Upstash error: ${json.error}`);
  return json.result;
}

export async function kvGet(key) {
  const result = await upstashCommand(['GET', key]);
  if (result === null) return null;
  if (typeof result === 'string') {
    try {
      return JSON.parse(result);
    } catch {
      return result;
    }
  }
  return result;
}

export async function kvSet(key, value) {
  await upstashCommand(['SET', key, JSON.stringify(value)]);
}

export async function kvLrange(key, start, stop) {
  const result = await upstashCommand(['LRANGE', key, String(start), String(stop)]);
  return Array.isArray(result) ? result : [];
}

export async function kvKeys(pattern, limit = 200) {
  const result = await upstashCommand(['KEYS', pattern]);
  if (!Array.isArray(result)) return [];
  return result.slice(0, limit);
}
