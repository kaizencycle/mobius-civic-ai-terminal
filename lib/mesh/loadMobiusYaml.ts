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
