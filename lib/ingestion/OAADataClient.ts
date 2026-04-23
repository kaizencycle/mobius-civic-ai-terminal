import { signOaaWritePayload } from '@/lib/oaa/signWrite';
import { resolveOaaHmacSecret, resolveOaaKvPostUrl } from '@/lib/mesh/loadMobiusYaml';

export type OaaWriteInput = {
  key: string;
  value: unknown;
  agent: string;
  cycle: string;
  intent?: string;
  previousHash?: string | null;
};

export type OaaWriteResult = { ok: true; hash: string; previous_hash?: string | null; ts?: number } | { ok: false; error: string };

/**
 * POST structured KV journal entries to OAA `/api/oaa/kv` (HMAC).
 * Requires `OAA_API_BASE` or `mobius.yaml` `ingest.sovereign_memory.write_url` + `OAA_HMAC_SECRET` or `KV_HMAC_SECRET`.
 */
export class OAADataClient {
  constructor(
    private readonly postUrl: string,
    private readonly hmacSecret: string,
  ) {}

  static fromEnv(): OAADataClient | null {
    const url = resolveOaaKvPostUrl();
    const secret = resolveOaaHmacSecret();
    if (!url || !secret) return null;
    return new OAADataClient(url, secret);
  }

  async write(input: OaaWriteInput): Promise<OaaWriteResult> {
    const signable: Record<string, unknown> = {
      key: input.key,
      value: input.value,
      agent: input.agent,
      cycle: input.cycle,
      ...(input.intent !== undefined ? { intent: input.intent } : {}),
      previousHash: input.previousHash ?? null,
    };
    const signature = signOaaWritePayload(signable, this.hmacSecret);

    try {
      const res = await fetch(this.postUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...signable, signature }),
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
      });
      const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) {
        const err = data && typeof data.error === 'string' ? data.error : `http_${res.status}`;
        return { ok: false, error: err };
      }
      if (!data) return { ok: false, error: 'empty_json_response' };
      const hash = typeof data.hash === 'string' ? data.hash : '';
      if (!hash) return { ok: false, error: 'missing_hash_in_response' };
      return {
        ok: true,
        hash,
        previous_hash:
          typeof data.previous_hash === 'string' || data.previous_hash === null
            ? (data.previous_hash as string | null)
            : undefined,
        ts: typeof data.ts === 'number' ? data.ts : undefined,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'oaa_fetch_failed' };
    }
  }
}
