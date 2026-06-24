import { execSync } from 'child_process';
import { readdirSync } from 'fs';
import { join } from 'path';

async function main() {
  const testDir = 'tests/contract';
  const files = readdirSync(testDir).filter(f => f.endsWith('.test.ts'));

  const results = await Promise.allSettled(
    files.map(f =>
      new Promise<void>((resolve, reject) => {
        try {
          execSync(`./node_modules/.bin/tsx ${join(testDir, f)}`, { stdio: 'inherit' });
          resolve();
        } catch {
          reject(new Error(`FAILED: ${f}`));
        }
      })
    )
  );

  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length > 0) {
    failures.forEach(f => console.error((f as PromiseRejectedResult).reason.message));
    process.exit(1);
  }
  console.log(`✓ All ${files.length} contract tests passed`);
}

main();
