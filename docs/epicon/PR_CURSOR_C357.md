# PR: Reserve Block .dat Canonization — C-357 (Cursor)

**Branch:** `cursor/c357-dat-canonization-a40d`  
**Repos:** mobius-civic-ai-terminal · Civic-Protocol-Core · Mobius-Substrate

## Summary

Implements C-357 cold canon path: read sealed blocks from vault KV → write NDJSON `blk*.dat` files → post hash anchors to CPC → commit to Mobius-Substrate (GitHub = substrate attestation).

Bypasses broken `/ledger/attest` JWT path without data loss.

## Terminal changes

- `lib/dat/*` — types, hash chain, canonize orchestrator
- `lib/vault/fetchAllSealedBlocks.ts` — reads via `listAllSeals`
- `lib/cpc/hashAnchor.ts` — CPC anchor client
- `app/api/canon/trigger`, `app/api/vault/blocks/all`, `app/api/canon/reserve-blocks/manifest`, `app/api/epicon/canon-event`
- `components/vault/AttestationStatus.tsx` — shows ◈ Canonized via .dat
- `scripts/canonize-reserve-blocks.ts`, `scripts/verify-dat-chain.js`

## Run migration

```bash
npx tsx scripts/canonize-reserve-blocks.ts --dry-run
npx tsx scripts/canonize-reserve-blocks.ts
node scripts/verify-dat-chain.js canon/reserve-blocks/
```

Copy `canon/reserve-blocks/` to Mobius-Substrate and push.

## Acceptance

- [x] `tsc --noEmit` clean
- [ ] Dry run against live KV
- [ ] CPC manifest returns anchored blocks after live run
- [ ] Vault UI shows canonized status
