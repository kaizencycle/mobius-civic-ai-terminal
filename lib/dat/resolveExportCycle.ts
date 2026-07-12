/**
 * Resolve operator cycle for export scripts and PR metadata.
 * Prefers explicit env, then CURRENT_CYCLE.md header, then calendar engine fallback.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { currentCycleId } from '@/lib/eve/cycle-engine';

const CYCLE_HEADER_RE = /^\*\*Cycle:\*\*\s*(C-\d+)/m;

export function resolveExportCycleFromEnv(): string | null {
  const fromEnv =
    process.env.CURRENT_CYCLE?.trim() ||
    process.env.OPERATOR_CYCLE?.trim() ||
    process.env.EPICON_CYCLE?.trim();
  return fromEnv || null;
}

export function resolveExportCycleFromFile(root = process.cwd()): string | null {
  const path = join(root, 'CURRENT_CYCLE.md');
  if (!existsSync(path)) return null;
  try {
    const text = readFileSync(path, 'utf8');
    const match = text.match(CYCLE_HEADER_RE);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Authority epoch for reserve-block .dat spec (frozen at C-357). */
export const RESERVE_BLOCK_SPEC_CYCLE = 'C-357';

/** PR7 export lane label (frozen at C-368). */
export const RESERVE_CANON_EXPORT_LANE = 'C-368';

export function resolveExportCycle(root = process.cwd()): string {
  return (
    resolveExportCycleFromEnv() ??
    resolveExportCycleFromFile(root) ??
    currentCycleId()
  );
}
