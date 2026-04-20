import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { MobiusManifestV1 } from '@/lib/slack-agent/types';

let cached: { mtimeMs: number; doc: MobiusManifestV1 } | null = null;

function manifestPath(): string {
  return join(process.cwd(), 'mobius-manifest.json');
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function parseManifest(raw: string): MobiusManifestV1 {
  const j = JSON.parse(raw) as Record<string, unknown>;
  const sa = j.slack_agent;
  if (!sa || typeof sa !== 'object') {
    throw new Error('manifest_missing_slack_agent');
  }
  const o = sa as Record<string, unknown>;
  const allowed = o.allowed_commands;
  const workflows = o.allowed_workflows;
  const wp = o.write_policy;
  if (!isStringArray(allowed)) throw new Error('manifest_invalid_allowed_commands');
  if (!isStringArray(workflows)) throw new Error('manifest_invalid_allowed_workflows');
  if (!wp || typeof wp !== 'object') throw new Error('manifest_invalid_write_policy');
  const w = wp as Record<string, unknown>;

  return {
    schema: typeof j.schema === 'string' ? j.schema : undefined,
    slack_agent: {
      enabled: asBool(o.enabled, false),
      mode: typeof o.mode === 'string' ? o.mode : undefined,
      allowed_commands: allowed,
      allowed_workflows: workflows,
      allowed_channel_ids: isStringArray(o.allowed_channel_ids) ? o.allowed_channel_ids : undefined,
      write_policy: {
        oaa_logging_required: asBool(w.oaa_logging_required, true),
        ledger_logging_for_meaningful_actions: asBool(w.ledger_logging_for_meaningful_actions, true),
        auto_merge_allowed: asBool(w.auto_merge_allowed, false),
        protected_truth_files_read_only: asBool(w.protected_truth_files_read_only, true),
      },
    },
    repo_touch: typeof j.repo_touch === 'object' && j.repo_touch !== null ? (j.repo_touch as Record<string, unknown>) : undefined,
  };
}

export function loadMobiusManifest(force = false): MobiusManifestV1 {
  const path = manifestPath();
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    throw new Error('manifest_file_missing');
  }
  if (!force && cached && cached.mtimeMs === mtimeMs) return cached.doc;

  const raw = readFileSync(path, 'utf8');
  const doc = parseManifest(raw);
  cached = { mtimeMs, doc };
  return doc;
}
