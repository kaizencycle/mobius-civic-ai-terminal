#!/usr/bin/env tsx
import { join } from 'node:path';
import { verifyTrackRCaptureAttestation } from '@/lib/watchdog/batchRepair/verifyTrackRCaptureAttestation';

const archiveArg = process.argv.find((arg) => arg.startsWith('--archive='));
const archivePath = archiveArg
  ? archiveArg.slice('--archive='.length)
  : join(process.cwd(), 'artifacts/C-403/track-r-live-dry-run/history/capture-0123Z');

const result = verifyTrackRCaptureAttestation({ archivePath });

console.log(`Capture ID: ${result.capture_id}`);
console.log(`Archive: ${result.archive_path}`);
console.log(`Verified at: ${result.verified_at}`);
console.log(`Verification status: ${result.verification_status}`);
console.log('');

for (const row of result.checks) {
  const icon = row.result === 'pass' ? '✓' : row.result === 'warn' ? '!' : '✗';
  console.log(`${icon} [${row.result}] ${row.check}`);
  console.log(`  ${row.detail}`);
}

console.log('');
console.log('Recomputed hashes:');
for (const [key, value] of Object.entries(result.recomputed_hashes)) {
  console.log(`  ${key}: ${value ?? 'null'}`);
}

if (result.verification_status !== 'adopt_ready') {
  process.exit(1);
}
