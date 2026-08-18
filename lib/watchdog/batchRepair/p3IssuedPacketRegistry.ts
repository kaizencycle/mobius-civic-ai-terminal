import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const ISSUED_PACKET_REGISTRY_PATH =
  'docs/epicon/cycles/C-407/p3-preparation/issued-packet-registry.json';

export type IssuedPacketRegistryEntry = {
  workflow_run_id: string;
  issued_at: string;
  journal_id: string;
  journal_hash: string;
  packet_hash: string;
  checked_out_commit: string;
  observed_production_commit: string;
  preparation_only: true;
  execution_authorized: false;
};

export type IssuedPacketRegistry = {
  schema_version: '1';
  note: string;
  entries: IssuedPacketRegistryEntry[];
};

const EMPTY_REGISTRY: IssuedPacketRegistry = {
  schema_version: '1',
  note:
    'Preparation-only registry — records unsigned P3 packets. Does not grant execution authority.',
  entries: [],
};

export function loadIssuedPacketRegistry(repoRoot?: string): IssuedPacketRegistry {
  const path = join(repoRoot ?? process.cwd(), ISSUED_PACKET_REGISTRY_PATH);
  if (!existsSync(path)) {
    return { ...EMPTY_REGISTRY, entries: [] };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as IssuedPacketRegistry;
    if (!Array.isArray(parsed.entries)) {
      return { ...EMPTY_REGISTRY, entries: [] };
    }
    return parsed;
  } catch {
    return { ...EMPTY_REGISTRY, entries: [] };
  }
}

export function collectIssuedJournalIds(registry: IssuedPacketRegistry): Set<string> {
  return new Set(registry.entries.map((entry) => entry.journal_id));
}

export function assertPacketNotPreviouslyIssued(args: {
  journalId: string;
  journalHash: string;
  packetHash: string;
  registry: IssuedPacketRegistry;
}): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const entry of args.registry.entries) {
    if (entry.journal_id === args.journalId) {
      errors.push(`journal_id ${args.journalId} already issued in run ${entry.workflow_run_id}`);
    }
    if (entry.journal_hash === args.journalHash) {
      errors.push(`journal_hash already issued in run ${entry.workflow_run_id}`);
    }
    if (entry.packet_hash === args.packetHash) {
      errors.push(`packet_hash already issued in run ${entry.workflow_run_id}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function appendIssuedPacketEntry(args: {
  registry: IssuedPacketRegistry;
  entry: IssuedPacketRegistryEntry;
}): IssuedPacketRegistry {
  return {
    ...args.registry,
    entries: [...args.registry.entries, args.entry],
  };
}

export function writeIssuedPacketRegistry(args: {
  registry: IssuedPacketRegistry;
  repoRoot?: string;
}): void {
  const path = join(args.repoRoot ?? process.cwd(), ISSUED_PACKET_REGISTRY_PATH);
  writeFileSync(path, `${JSON.stringify(args.registry, null, 2)}\n`, 'utf8');
}
