# C-400 Vault Seal Pointer Repair — Operator Witness

**Cycle:** C-400  
**Seal:** C-400–VAULT–REPAIR–001  
**Date:** 2026-08-12  
**Authority:** Mobius Custodian (kaizencycle)  
**Operator surface:** Cloud Agent (Cursor) + Upstash REST  

---

## Summary

Production key `vault:seal:latest` held a corrupted migrate-v1 object (per-character string spread). A direct Upstash `SET` restored the pointer to bare seal id `seal-C-372-002`. Live Terminal API confirmed resolution immediately after repair.

---

## Pre-repair witness

**Command:**

```bash
curl -sS -X POST "$UPSTASH_REDIS_REST_URL" \
  -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '["GET","vault:seal:latest"]'
```

**Response (corrupted object):**

```json
{"result":"{\"0\":\"s\",\"1\":\"e\",\"2\":\"a\",\"3\":\"l\",\"4\":\"-\",\"5\":\"C\",\"6\":\"-\",\"7\":\"3\",\"8\":\"7\",\"9\":\"2\",\"10\":\"-\",\"11\":\"0\",\"12\":\"0\",\"13\":\"2\",\"sealId\":\"latest\",\"schema_version\":\"v2\",\"event_id\":\"latest-migrated-1784046141807\",\"agent_id\":\"ATLAS\",\"agent_origin\":\"migration\",\"attestation_signature\":\"86b2657a59438059d6b56b868c6b6e9fb1445f06b3707464deeba19b8a2164a2\",\"attested_at\":1784046141807,\"migrated_from\":\"v1\",\"migration_cycle\":\"C-305\",\"operatorNote\":\"canon v1 migration\",\"source\":\"terminal-migrate-v1\",\"terminal_base_url\":\"https://mobius-civic-ai-terminal.vercel.app\",\"terminal_id\":\"mobius-civic-ai-terminal\",\"api_base\":\"https://mobius-civic-ai-terminal.vercel.app\",\"status\":\"promoted\",\"promotedAt\":1784046141807}"}
```

**Diagnosis:** `POST /api/vault/migrate-v1` with `{"sealId":"latest"}` wrote a v2 migration object onto the CAS pointer key. See `docs/runbooks/vault-seal-latest-pointer-repair.md`.

---

## Repair execution

**Command:**

```bash
curl -sS -X POST "$UPSTASH_REDIS_REST_URL" \
  -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '["SET","vault:seal:latest","\"seal-C-372-002\""]'
```

**Response:**

```json
{"result":"OK"}
```

---

## Post-repair verification (Upstash REST)

**Command:** same `GET` as pre-repair.

**Response:**

```json
{"result":"\"seal-C-372-002\""}
```

The extra JSON escaping is correct for raw REST `SET` (SDK would use `redis.set(key, 'seal-C-372-002')` without double-quoting).

---

## Live Terminal API confirmation

**Endpoint:** `GET https://terminal.mobius-substrate.com/api/vault/status`

**Observed (2026-08-12):**

```json
{
  "latest_seal_id": "seal-C-372-002",
  "seals_count": 360,
  "status": "sealed"
}
```

---

## Custodian attestation

- Pre-repair corruption witnessed before any write.
- Repair used human-approved target seal `seal-C-372-002` (last attested tip per runbook).
- Post-repair GET and Terminal API both confirm pointer resolution.
- Production secrets were not committed; local `.env.production.local` removed after operation.

---

## Related work

| Item | Status |
|------|--------|
| Code guard (migrate-v1 reserved keys) | PR #648 merged |
| Micro cycle lag fix | PR #649 merged (`92e8d617`) |
| Federation scan package | Mobius-Substrate PR #433 |

---

*"We heal as we walk." — Mobius Systems*
