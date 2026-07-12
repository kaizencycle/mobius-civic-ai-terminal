/**
 * Upstash REST credential helpers.
 * GitHub Actions secrets pasted from Vercel often include trailing newlines.
 */

export function getUpstashRestCredentials(): { url: string; token: string } | null {
  const url = (
    process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  )?.trim();
  const token = (
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  )?.trim();
  if (!url || !token) return null;
  return { url, token };
}
