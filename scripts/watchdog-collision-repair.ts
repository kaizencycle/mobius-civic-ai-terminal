#!/usr/bin/env tsx
/**
 * C-373 collision repair — applies approved reconciliation receipts only.
 *
 * Usage:
 *   pnpm watchdog:collision-repair --receipt ./receipt.json
 *   pnpm watchdog:collision-repair --receipt rcpt-C-373-b001-... --apply
 */

import { config } from 'dotenv';
import { applyCollisionRepair } from '@/lib/watchdog/collisionRepair';

config({ path: '.env.local' });

function parseArgs(argv: string[]): { receipt: string | null; apply: boolean } {
  let receipt: string | null = null;
  let apply = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--receipt' && argv[i + 1]) {
      receipt = argv[i + 1];
      i++;
    }
    if (argv[i] === '--apply') apply = true;
    if (argv[i] === '--dry-run') apply = false;
  }
  return { receipt, apply };
}

async function main(): Promise<void> {
  const { receipt, apply } = parseArgs(process.argv.slice(2));
  if (!receipt) {
    console.error('Usage: pnpm watchdog:collision-repair --receipt <path-or-id> [--apply]');
    process.exit(2);
  }

  const dryRun = !apply;
  if (dryRun) {
    console.log('Mode: dry-run (default). Pass --apply to mutate derived indexes/pointers only.\n');
  } else {
    console.log('Mode: APPLY — mutating derived canonical indexes and LATEST_SEAL_KEY only.\n');
  }

  const result = await applyCollisionRepair({
    receiptPathOrId: receipt,
    dryRun,
    repairLatestPointer: true,
  });

  for (const step of result.steps) {
    console.log(`${step.ok ? '✓' : '✗'} ${step.step}: ${step.detail}`);
  }

  if (result.latest_pointer) {
    console.log(`\nLatest pointer: ${result.latest_pointer.message}`);
  }

  if (!result.ok) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
