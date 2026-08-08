# Runbook — repair corrupted `vault:seal:latest` pointer

**Cycle:** C-397  
**Root cause:** `POST /api/vault/migrate-v1` with `{"sealId":"latest"}` wrote a v2 migration object onto the CAS pointer key `vault:seal:latest` (bare string expected). Spreading a string in JS produced per-character keys (`"0":"s",…`).

## One-time data repair (production)

After deploying the migrate-v1 guard fix, reset the pointer to a bare seal id string:

```bash
# Upstash REST or redis-cli — value must be a JSON string, not an object
SET vault:seal:latest "\"seal-C-372-002\""
```

Use the last attested seal in `vault:seals:index:attested` unless Track R adjudication selects a different canonical tip.

Verify:

```bash
GET vault:seal:latest
# → "seal-C-372-002" (string)
```

## Code fix (merged separately)

- Reject reserved ids: `latest`, `candidate`
- Runtime `parseV1SealRecord()` before spread — never cast plain strings to `V1Seal`
- `migration_cycle` from `resolveOperatorCycleId()` instead of hardcoded `C-305`

## Do not use

- `repairLatestSealPointer()` CAS while the key holds the corrupted object — compare will not match. Direct SET first, then allow normal CAS maintenance.
