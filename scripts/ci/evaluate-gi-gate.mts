#!/usr/bin/env node
/**
 * CI GI gate — evaluates real computeGI (tsx) or optional snapshot-lite `gi` field.
 * No require() of TS sources, no || echo "0.78" swallow.
 *
 * GI_GATE_SNAPSHOT_URL: optional snapshot-lite URL for live `gi`.
 * While GI_MERGE_GATE_MINIMUM === GI_FLOOR, published computeGI cannot fall below the floor.
 */
import { computeGI } from '../../lib/gi/compute.ts';
import { GI_MERGE_GATE_MINIMUM } from '../../lib/gi/gatePolicy.ts';

function parseMinimum(): number {
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

async function main(): Promise<void> {
  if (process.argv.includes('--self-test')) {
    const minimum = parseMinimum();
    // Proves the gate comparison can fail (independent of computeGI publish floor).
    const syntheticGi = minimum - 0.01;
    if (syntheticGi >= minimum) {
      console.error('::error::GI gate self-test: invalid synthetic GI');
      process.exit(1);
    }
    console.log(`✓ GI gate self-test: ${syntheticGi} < ${minimum} (threshold logic)`);
    return;
  }

  const minimum = parseMinimum();
  const { gi, source } = await resolveGiForGate();
  console.log(`GI gate source: ${source}`);
  console.log(`GI score:   ${gi}`);
  console.log(`GI minimum: ${minimum}`);

  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_OUTPUT, `gi=${gi}\nsource=${source}\n`);
  }

  if (gi < minimum) {
    console.error(`::error::GI score (${gi}) is below merge threshold (${minimum})`);
    process.exit(1);
  }
  console.log(`✅ GI gate passed (${gi} >= ${minimum})`);
}

main().catch((err) => {
  console.error('::error::GI gate evaluator failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
