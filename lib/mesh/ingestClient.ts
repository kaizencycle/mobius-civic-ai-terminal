/**
 * POST hashed payloads to the durable ledger ingest URL declared in mobius.yaml (ingest.targets).
 * Does not invent URLs or tokens — returns null URL / structured skip when undeclared.
 */

import { hashPayload } from '@/lib/mic/hash';
import { loadMobiusYaml, resolveDeclaredIngestWriteUrl, resolveIngestBearerToken } from '@/lib/mesh/loadMobiusYaml';

export type MobiusIngestPostResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; skipped: true; reason: 'no_write_url' | 'no_bearer' | 'ingest_disabled' }
  | { ok: false; skipped: false; status?: number; error: string };

export type MobiusIngestEnvelope<T> = {
  type: string;
  payload: T;
  hash: string;
  hash_algorithm: 'sha256';
  source_node_id: string;
};

function meshNodeId(): string {
  const doc = loadMobiusYaml();
  const id = doc.mesh && typeof (doc.mesh as { node_id?: string }).node_id === 'string'
    ? (doc.mesh as { node_id: string }).node_id
    : 'mobius-terminal';
  return id;
}

/**
 * POST `{ type, payload, hash, hash_algorithm, source_node_id }` to declared ingest.
 * `hash` must match `hashPayload(payload)` or the envelope is not sent (operator truth).
 */
export async function postMobiusIngest<T>(args: {
  type: string;
  payload: T;
}): Promise<MobiusIngestPostResult> {
  const doc = loadMobiusYaml();
  if (doc.ingest?.enabled === false) {
    return { ok: false, skipped: true, reason: 'ingest_disabled' };
  }

  const url = resolveDeclaredIngestWriteUrl(doc);
  if (!url) {
    return { ok: false, skipped: true, reason: 'no_write_url' };
  }

  const token = resolveIngestBearerToken();
  if (!token) {
    return { ok: false, skipped: true, reason: 'no_bearer' };
  }

  const envelope: MobiusIngestEnvelope<T> = {
    type: args.type,
    payload: args.payload,
    hash: hashPayload(args.payload),
    hash_algorithm: 'sha256',
    source_node_id: meshNodeId(),
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(envelope),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, skipped: false, status: res.status, error: typeof body === 'object' && body && 'error' in body ? String((body as { error: unknown }).error) : `http_${res.status}` };
    }
    return { ok: true, status: res.status, body };
  } catch (e) {
    return { ok: false, skipped: false, error: e instanceof Error ? e.message : 'ingest_fetch_failed' };
  }
}
