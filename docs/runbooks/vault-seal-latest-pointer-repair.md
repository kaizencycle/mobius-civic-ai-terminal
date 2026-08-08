# Runbook — repair corrupted `vault:seal:latest` pointer

**Cycle:** C-397  
**Root cause:** `POST /api/vault/migrate-v1` with `{"sealId":"latest"}` wrote a v2 migration object onto the CAS pointer key `vault:seal:latest` (bare string expected). Spreading a string in JS produced per-character keys (`"0":"s",…`).

## One-time data repair (production)

After **merge + deploy** of PR #648, reset the pointer to a bare seal id string.

### Via Upstash Console / redis-cli / REST (direct SET)

`@upstash/redis` JSON-encodes values on write and decodes on read — the same as `redis.set(LATEST_SEAL_KEY, seal.seal_id)` in `appendSealToChain`. When issuing a raw SET, store the JSON-encoded string form:

```bash
SET vault:seal:latest "\"seal-C-372-002\""
```

### Via Node / `@upstash/redis` SDK — do not double-quote

```ts
await redis.set('vault:seal:latest', 'seal-C-372-002'); // SDK adds JSON quoting
// WRONG: redis.set('vault:seal:latest', '"seal-C-372-002"'); // double-encoded
```

Use the last attested seal in `vault:seals:index:attested` unless Track R adjudication selects a different canonical tip.

Verify immediately after SET:

```bash
GET vault:seal:latest
# → seal-C-372-002  (decoded string — not a JSON object with "0":"s",…)
```

`getLatestSealId()` after deploy requires `typeof raw === 'string' && raw.startsWith('seal-')`.

## Code fix (PR #648 — not yet on main)

- Reject reserved ids: `latest`, `candidate`
- Runtime `parseV1SealRecord()` before spread — never cast plain strings to `V1Seal`
- `migration_cycle` from `resolveOperatorCycleId()` instead of hardcoded `C-305`

Contract tests: `pnpm exec tsx tests/contract/migrateV1Guard.test.ts` — **6/6 pass** (verified on branch).

## Deployment sequence

1. Merge and deploy **PR #648** (`mobius-civic-ai-terminal`)
2. Manual `SET vault:seal:latest` (see above — mind SDK vs CLI encoding)
3. `GET` verify → string `seal-C-372-002`, not object
4. Allow `repairLatestSealPointer()` / watchdog CAS to resume (Track R lineage adjudication remains separate)

## Do not use

- `repairLatestSealPointer()` CAS while the key holds the corrupted object — compare will not match. Direct SET first, then allow normal CAS maintenance.
