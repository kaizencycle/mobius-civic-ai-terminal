#!/usr/bin/env node
/**
 * CI GI gate CLI — import scripts/ci/gi-gate-lib.mts from tests (no side effects).
 */
import { pathToFileURL } from 'node:url';
import {
  mergeGateFailureMessage,
  parseMergeGateMinimum,
  resolveGiForGate,
  runMergeGateSelfTest,
} from './gi-gate-lib.mts';

async function main(): Promise<void> {
  if (process.argv.includes('--self-test')) {
    const minimum = parseMergeGateMinimum();
    runMergeGateSelfTest(minimum);
    console.log(`✓ GI gate self-test: failure branch verified (e.g. ${minimum - 0.01} < ${minimum})`);
    return;
  }

  const minimum = parseMergeGateMinimum();
  const { gi, source } = await resolveGiForGate();
  console.log(`GI gate source: ${source}`);
  console.log(`GI score:   ${gi}`);
  console.log(`GI minimum: ${minimum}`);

  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(process.env.GITHUB_OUTPUT, `gi=${gi}\nsource=${source}\n`);
  }

  const failMsg = mergeGateFailureMessage(gi, minimum);
  if (failMsg !== null) {
    console.error(`::error::${failMsg}`);
    process.exit(1);
  }
  console.log(`✅ GI gate passed (${gi} >= ${minimum})`);
}

const isCli =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  main().catch((err) => {
    console.error('::error::GI gate evaluator failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
