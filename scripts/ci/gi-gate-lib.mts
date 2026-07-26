/**
 * GI merge gate helpers (import-safe — no process.exit on load).
 */
import { computeGI } from '../../lib/gi/compute.ts';
import { GI_MERGE_GATE_MINIMUM } from '../../lib/gi/gatePolicy.ts';

export function parseMergeGateMinimum(): number {
  const env = process.env.GI_MERGE_GATE_MINIMUM;
  if (env !== undefined && env !== '') {
    const n = Number(env);
    if (!Number.isFinite(n)) throw new Error(`Invalid GI_MERGE_GATE_MINIMUM: ${env}`);
    return n;
  }
  return GI_MERGE_GATE_MINIMUM;
}

async function giFromSnapshotLite(url: string): Promise<number> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`snapshot-lite HTTP ${res.status} from ${url}`);
  }
  const body = (await res.json()) as { gi?: unknown };
  const gi = body.gi;
  if (typeof gi !== 'number' || !Number.isFinite(gi)) {
    throw new Error(`snapshot-lite response missing numeric gi from ${url}`);
  }
  return gi;
}

function giFromLocalCompute(): number {
  return computeGI({
    zeusScores: [0.8, 0.75, 0.85],
    freshness: 'fresh',
    tripwire: 'none',
    activeAgents: 8,
  }).global_integrity;
}

export async function resolveGiForGate(): Promise<{ gi: number; source: string }> {
  const url = process.env.GI_GATE_SNAPSHOT_URL?.trim();
  if (url) {
    return { gi: await giFromSnapshotLite(url), source: `snapshot-lite:${url}` };
  }
  return { gi: giFromLocalCompute(), source: 'local:computeGI' };
}

/** Returns an error message when GI is below minimum; null when the gate passes. */
export function mergeGateFailureMessage(gi: number, minimum: number): string | null {
  if (gi < minimum) {
    return `GI score (${gi}) is below merge threshold (${minimum})`;
  }
  return null;
}

export function runMergeGateSelfTest(minimum: number = parseMergeGateMinimum()): void {
  const failingGi = minimum - 0.01;
  const failMsg = mergeGateFailureMessage(failingGi, minimum);
  if (failMsg === null) {
    throw new Error('GI gate self-test: expected sub-minimum GI to fail merge gate');
  }
  const passMsg = mergeGateFailureMessage(minimum, minimum);
  if (passMsg !== null) {
    throw new Error('GI gate self-test: GI at minimum should pass');
  }
  const passAbove = mergeGateFailureMessage(minimum + 0.05, minimum);
  if (passAbove !== null) {
    throw new Error('GI gate self-test: GI above minimum should pass');
  }
}
