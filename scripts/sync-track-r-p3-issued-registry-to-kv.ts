#!/usr/bin/env node
/**
 * Sync committed issued-packet registry to KV (read-only metadata; no execution authority).
 */
import { syncCommittedIssuedPacketRegistryToKv } from '../lib/watchdog/batchRepair/p3IssuedPacketRegistryStore.ts';

async function main() {
  const result = await syncCommittedIssuedPacketRegistryToKv();
  if (!result.ok) {
    console.error('Track R P3 issued registry KV sync failed:');
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }
  console.log(`Track R P3 issued registry synced to KV (${result.entry_count} entries)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
