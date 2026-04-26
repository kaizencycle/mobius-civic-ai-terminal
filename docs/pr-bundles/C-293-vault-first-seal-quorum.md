# C-293 — Vault First Seal + Full Quorum

## Purpose

C-293 separates two concepts that were visually close in the Vault UI but operationally different:

1. **Reserve Seal** — proof/accounting event. A 50-unit reserve tranche becomes hash-chained and attested by Sentinel quorum.
2. **Fountain Unlock** — economic activation event. Requires GI >= 0.95 sustain conditions and remains locked while GI is below threshold.

This PR creates an operator-controlled full quorum route for the first Reserve Seal and adds diagnostics explaining why automatic sealing may not have fired.

## Why auto-seal did not work

The Vault screen showed roughly:

- v1 cumulative reserve: ~150 units
- current v2 tranche: ~47 units
- sealed reserve total: 0
- GI: ~0.69

The auto-seal path uses the canonical v2 accumulator:

```txt
vault:in_progress_balance >= 50
```

It does **not** silently convert v1 cumulative compatibility history into v2 sealed reserve. That is intentional: v1 cumulative reserve is historical compatibility state, while v2 reserve seals are hash-chained proof records with deposit hashes and quorum.

So auto-seal did not fire because canonical v2 balance was below 50, even though v1 cumulative balance was over 150.

## What changed

### New route

```txt
POST /api/vault/seal/quorum
```

Auth accepts existing operator/service bearer tokens:

- `AGENT_SERVICE_TOKEN`
- `CRON_SECRET`
- `MOBIUS_SERVICE_SECRET`

Behavior:

1. Reads/uses current v2 candidate if present.
2. If no candidate and v2 balance >= 50, forms candidate.
3. Records pass attestations for the full Sentinel quorum:
   - ATLAS
   - ZEUS
   - EVE
   - JADE
   - AUREA
4. Evaluates quorum.
5. Finalizes attested Seal if quorum passes.
6. Keeps `fountain_status: pending`.

### Explicit first-seal bootstrap

For the first Seal only, operator may pass:

```json
{ "bootstrapLegacyReserve": true }
```

This seeds v2 from v1 cumulative reserve only when:

- no attested Seal exists yet;
- v1 cumulative reserve >= 50;
- hashed deposits exist.

This prevents silent conversion of compatibility history into canon.

### Cron diagnostics

`/api/cron/vault-attestation` now returns:

- `in_progress_balance`
- `threshold`
- `auto_seal_reason`

This explains whether the cron is waiting because:

- v2 balance is below threshold;
- candidate is in flight;
- quorum is waiting;
- timeout was injected;
- candidate finalized;
- candidate formation failed.

## First Seal runbook

After deploy:

```bash
curl -X POST https://mobius-civic-ai-terminal.vercel.app/api/vault/seal/quorum \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"bootstrapLegacyReserve":true}'
```

Expected result:

```json
{
  "ok": true,
  "outcome": "seal_attested",
  "status": "attested",
  "fountain_status": "pending"
}
```

Then verify:

```bash
curl https://mobius-civic-ai-terminal.vercel.app/api/vault/status
curl https://mobius-civic-ai-terminal.vercel.app/api/vault/seal?scope=audit
```

## Canon

A Reserve Seal can happen before the Fountain unlocks.

Seal proves accumulation.
GI sustain proves readiness.
Fountain remains locked until integrity conditions pass.

We heal as we walk.
