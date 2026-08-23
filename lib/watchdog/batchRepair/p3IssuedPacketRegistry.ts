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

export type LoadIssuedPacketRegistryResult =
  | { ok: true; registry: IssuedPacketRegistry }
  | { ok: false; errors: string[] };

export function parseIssuedPacketRegistry(parsed: unknown): LoadIssuedPacketRegistryResult {
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, errors: ['issued-packet registry must be an object'] };
  }
  const registry = parsed as IssuedPacketRegistry;
  if (registry.schema_version !== '1') {
    return {
      ok: false,
      errors: ['issued-packet registry schema_version must be 1'],
    };
  }
  if (!Array.isArray(registry.entries)) {
    return {
      ok: false,
      errors: ['issued-packet registry entries must be an array'],
    };
  }
  return { ok: true, registry };
}

export function compareIssuedPacketRegistryEntries(
  a: IssuedPacketRegistryEntry,
  b: IssuedPacketRegistryEntry,
): number {
  const issuedCompare = b.issued_at.localeCompare(a.issued_at);
  if (issuedCompare !== 0) return issuedCompare;
  return b.workflow_run_id.localeCompare(a.workflow_run_id);
}

export function selectLatestIssuedPacketEntry(
  registry: IssuedPacketRegistry,
): IssuedPacketRegistryEntry | null {
  if (registry.entries.length === 0) return null;
  return [...registry.entries].sort(compareIssuedPacketRegistryEntries)[0] ?? null;
}

export function resolveLatestIssuedPacketRunId(registry: IssuedPacketRegistry): string | null {
  return selectLatestIssuedPacketEntry(registry)?.workflow_run_id ?? null;
}

export function loadIssuedPacketRegistry(repoRoot?: string): LoadIssuedPacketRegistryResult {
  const path = join(repoRoot ?? process.cwd(), ISSUED_PACKET_REGISTRY_PATH);
  if (!existsSync(path)) {
    return {
      ok: false,
      errors: [`issued-packet registry missing at ${ISSUED_PACKET_REGISTRY_PATH}`],
    };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return parseIssuedPacketRegistry(parsed);
  } catch (error) {
    return {
      ok: false,
      errors: [
        `issued-packet registry unreadable: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
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
    if (args.packetHash && entry.packet_hash === args.packetHash) {
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
