#!/usr/bin/env node
// scripts/check-env-example.mjs
// C-339 PR-C item 7: keep .env.example 1:1 with the lib/env.ts schema.
//
// A drifted .env.example is an operator trap: a contributor copies it, the app
// silently misses a var, and the failure surfaces as a runtime 401 deep in a
// fetch. This check makes the two files a single source of truth.
//
// Exit 1 if any schema key is missing from .env.example, or any .env.example
// key is missing from the schema. NODE_ENV is runtime-provided and exempt.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RUNTIME_PROVIDED = new Set(['NODE_ENV']);

function envExampleKeys() {
  const text = readFileSync(join(ROOT, '.env.example'), 'utf8');
  const keys = new Set();
  for (const line of text.split('\n')) {
    const m = /^([A-Z0-9_]+)=/.exec(line.trim());
    if (m) keys.add(m[1]);
  }
  return keys;
}

function schemaKeys() {
  const text = readFileSync(join(ROOT, 'lib', 'env.ts'), 'utf8');
  const keys = new Set();
  // Only scan the serverSchema object body: lines like `  KEY: z.string()...`
  for (const line of text.split('\n')) {
    const m = /^\s{2}([A-Z0-9_]+):\s*z\./.exec(line);
    if (m) keys.add(m[1]);
  }
  return keys;
}

function main() {
  const example = envExampleKeys();
  const schema = schemaKeys();

  const missingInExample = [...schema].filter((k) => !example.has(k) && !RUNTIME_PROVIDED.has(k));
  const missingInSchema = [...example].filter((k) => !schema.has(k));

  let ok = true;
  if (missingInExample.length > 0) {
    ok = false;
    console.error('❌ In lib/env.ts schema but missing from .env.example:');
    for (const k of missingInExample.sort()) console.error(`   - ${k}`);
  }
  if (missingInSchema.length > 0) {
    ok = false;
    console.error('❌ In .env.example but missing from lib/env.ts schema:');
    for (const k of missingInSchema.sort()) console.error(`   - ${k}`);
  }

  if (!ok) {
    console.error('\nFix: add the missing keys so .env.example and lib/env.ts agree.');
    process.exit(1);
  }
  console.log(`✅ .env.example ↔ lib/env.ts in sync (${schema.size} keys).`);
}

main();
