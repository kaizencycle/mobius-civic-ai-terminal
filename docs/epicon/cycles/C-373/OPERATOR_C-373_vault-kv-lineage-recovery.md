# Operator Runbook — C-373 Vault/KV Lineage Recovery

**Read first:** `docs/epicon/cycles/C-373/EPICON_C-373_ATLAS_vault-kv-canonical-lineage-recovery_v1.md`

---

## Phase 0 — Preflight (no mutations)

1. Confirm production deployment SHA from snapshot-lite (do not assume `main` HEAD is deployed).
2. Confirm `SEAL_INTEGRITY_GATE` is **not** `off`.
3. Run full KV watchdog and save report.

```bash
curl -s https://mobius-civic-ai-terminal.vercel.app/api/cron/kv-watchdog | jq .
```

Expected critical findings before repair:

- `latest_seal_key_present` — critical when attested seals exist but `vault:seal:latest` missing
- `block_number_collisions` — critical when hash-divergent attested sequence collisions exist

---

## Phase 1 — Freeze (existing gate)

No new freeze required if `SEAL_INTEGRITY_GATE=on` (default). Verified paths:

| Path | Blocks when gate active |
|------|-------------------------|
| `lib/vault-v2/deposit.ts` | New candidate formation |
| `app/api/vault/seal/attest/route.ts` | PASS attestations (flag/reject still allowed) |
| `app/api/cron/vault-attestation/route.ts` | Auto-pass + finalization |

Observation-only: watchdog cron, read APIs, journal ingestion.

---

## Phase 2 — Collision audit (read-only)

Requires `.env.local` with production KV credentials.

```bash
pnpm watchdog:collision-audit
pnpm watchdog:collision-audit --json --out artifacts/C-373/collision-audit.json
```

- Exit code **1** when hash-divergent collisions exist (expected pre-repair).
- **No KV writes** in audit mode.

---

## Phase 3 — Human + ZEUS + EVE reconciliation

For each `hash_divergent` collision group:

1. Compare evidence: Substrate ledger, Civic Protocol Core attestations, journal lineage, EPICON refs.
2. Choose `canonical_seal_id` — **not** autonomously finalized for hash-divergent groups.
3. Build receipt JSON (or use `buildReceiptFromCollision` in a one-off script).
4. Set:
   - `resolution_status: approved`
   - `human_approval: approved`
   - `zeus_verdict: approved`
   - `eve_verdict: approved`
5. Recompute `receipt_hash` via `sealReceipt()` before save.

States: `proposed` → `approved` → `applied` (application recorded in mutation journal only; receipt file is append-only).

---

## Phase 4 — Repair (dry-run first)

```bash
pnpm watchdog:collision-repair --receipt artifacts/C-373/receipts/rcpt-C-373-b001.json
pnpm watchdog:collision-repair --receipt artifacts/C-373/receipts/rcpt-C-373-b001.json --apply
```

**Mutates only:**

- `watchdog:canonical:block:{n}` — derived canonical winner per block
- `watchdog:canonical:quarantined` — superseded seal ids (evidence preserved in KV)
- `vault:seal:latest` — with compare-and-set guard
- `watchdog:collision:mutation-journal` — append-only repair log

**Never mutates:** `vault:seal:{seal_id}` sealed bodies, sequence numbers, or attestations.

---

## Phase 5 — Post-repair verification

```bash
pnpm watchdog:collision-audit   # expect exit 0 after all blocks reconciled
curl -s .../api/cron/kv-watchdog | jq '.findings[] | select(.severity=="critical")'
```

Required clean checks:

- `kv_budget_suspension` ok
- `kv_write_canary` ok
- `latest_seal_key_present` ok
- `latest_seal_key_consistency` ok
- `block_number_collisions` ok

Critical alert clears via `clearSealIntegrityGateIfCollisionsResolved` on next watchdog run — **do not** manually delete `watchdog:kv:critical-alert` unless documented exception.

---

## Phase 6 — Deploy (human approval)

1. Merge PR through normal process.
2. **One intentional** production deployment.
3. Verify `snapshot-lite.deployment.commit_sha` matches merged SHA.
4. Re-run watchdog against production KV.
5. Confirm Vault, Ledger, Journal canonical head agreement.

---

## Gap analysis (Phase 1)

| Risk | Status |
|------|--------|
| New candidate during collision | **Blocked** — deposit + tryFormNextCandidate |
| PASS attestation during collision | **Blocked** — attest route |
| Reserve block promotion | **Blocked** — vault-attestation cron gate |
| Missing LATEST_SEAL_KEY | **Not gate-blocking** — repaired in Phase 4–6 after collision resolution |

No additional freeze patch required for C-373 scope.
