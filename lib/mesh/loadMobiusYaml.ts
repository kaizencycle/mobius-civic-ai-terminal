/**
 * Load and parse root `mobius.yaml` (v1) — declaration contract only; no writes.
 */

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

export const MOBIUS_PAYLOAD_TYPES_V1 = [
  'EPICON_ENTRY_V1',
  'MIC_READINESS_V1',
  'MIC_SEAL_V1',
  'MIC_RESERVE_RECONCILIATION_V1',
  'MIC_GENESIS_BLOCK',
  'MOBIUS_PULSE_V1',
  'OAA_MEMORY_ENTRY_V1',
] as const;

export type MobiusPayloadTypeV1 = (typeof MOBIUS_PAYLOAD_TYPES_V1)[number];

export type IngestTargetV1 = {
  node_id: string;
  purpose?: string;
  write_url: string;
  auth?: string;
  accepts?: string[];
};

export type MobiusYamlV1 = {
  version?: string;
  mesh?: Record<string, unknown>;
  pulse?: Record<string, unknown>;
  ingest?: {
    enabled?: boolean;
    mode?: string;
    hot_state?: { type?: string };
    sovereign_memory?: {
      node_id?: string;
      write_url?: string;
      auth?: string;
      accepts?: string[];
    };
    durable_ledger?: {
      node_id?: string;
      write_url?: string;
      auth?: string;
    };
    targets?: IngestTargetV1[];
    accepts?: string[];
    write_url?: string;
    auth?: string;
  };
  mcp?: Record<string, unknown>;
  policy?: Record<string, unknown>;
};

let cached: { mtimeMs: number; doc: MobiusYamlV1 } | null = null;

function mobiusPath(): string {
  return join(process.cwd(), 'mobius.yaml');
}

export function loadMobiusYaml(force = false): MobiusYamlV1 {
  const path = mobiusPath();
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    return {};
  }
  if (!force && cached && cached.mtimeMs === mtimeMs) return cached.doc;

  const raw = readFileSync(path, 'utf8');
  const doc = parseYaml(raw) as MobiusYamlV1;
  cached = { mtimeMs, doc };
  return doc;
}

/**
 * Resolved durable ledger ingest URL for the first `ingest.targets[]` entry.
 * Priority: target.write_url (if non-empty) → MOBIUS_INGEST_WRITE_URL → null.
 */
export function resolveDeclaredIngestWriteUrl(doc: MobiusYamlV1 = loadMobiusYaml()): string | null {
  const dl = doc.ingest?.durable_ledger;
  const fromDl = typeof dl?.write_url === 'string' ? dl.write_url.trim() : '';
  if (fromDl.length > 0) return fromDl;
  const t = doc.ingest?.targets?.[0];
  const fromYaml = typeof t?.write_url === 'string' ? t.write_url.trim() : '';
  if (fromYaml.length > 0) return fromYaml;
  const env = process.env.MOBIUS_INGEST_WRITE_URL?.trim();
  return env && env.length > 0 ? env : null;
}

export function resolveIngestBearerToken(): string | null {
  const t = loadMobiusYaml().ingest?.targets?.[0];
  const auth = (t?.auth ?? 'bearer').toLowerCase();
  if (auth !== 'bearer') return null;
  const tok =
    process.env.MOBIUS_INGEST_BEARER_TOKEN?.trim() ||
    process.env.AGENT_SERVICE_TOKEN?.trim() ||
    process.env.MOBIUS_SERVICE_SECRET?.trim();
  return tok && tok.length > 0 ? tok : null;
}

/** OAA POST /api/oaa/kv base (no trailing slash). YAML `ingest.sovereign_memory.write_url` or `OAA_API_BASE`. */
export function resolveOaaBaseUrl(doc: MobiusYamlV1 = loadMobiusYaml()): string | null {
  const sm = doc.ingest?.sovereign_memory;
  const fromYaml = typeof sm?.write_url === 'string' ? sm.write_url.trim() : '';
  if (fromYaml.length > 0) {
    return fromYaml.replace(/\/api\/oaa\/kv\/?$/i, '').replace(/\/+$/, '');
  }
  const env = process.env.OAA_API_BASE?.trim() ?? process.env.NEXT_PUBLIC_OAA_API_URL?.trim();
  if (!env) return null;
  return env.replace(/\/+$/, '');
}

export function resolveOaaKvPostUrl(doc: MobiusYamlV1 = loadMobiusYaml()): string | null {
  const sm = doc.ingest?.sovereign_memory;
  const raw = typeof sm?.write_url === 'string' ? sm.write_url.trim() : '';
  if (raw.includes('/api/oaa/kv')) return raw.replace(/\/+$/, '');
  const base = resolveOaaBaseUrl(doc);
  if (!base) return null;
  return `${base}/api/oaa/kv`;
}

export function resolveOaaHmacSecret(): string | null {
  const s =
    process.env.OAA_HMAC_SECRET?.trim() ||
    process.env.KV_HMAC_SECRET?.trim();
  return s && s.length > 0 ? s : null;
}

export function isDualWriteMode(): boolean {
  const m = (process.env.WRITE_MODE ?? 'dual').trim().toLowerCase();
  return m === 'dual' || m === 'oaa' || m === 'oaa+dual';
}

export function isOaaPublishEnabled(): boolean {
  if (loadMobiusYaml().ingest?.enabled === false) return false;
  if (!isDualWriteMode()) return false;
  return resolveOaaKvPostUrl() !== null && resolveOaaHmacSecret() !== null;
}
