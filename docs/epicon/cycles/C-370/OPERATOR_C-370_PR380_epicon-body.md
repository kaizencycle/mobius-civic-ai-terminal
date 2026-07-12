# Operator Paste — Mobius-Substrate PR #380 EPICON-02 Body

Replace the entire PR description on
[PR #380](https://github.com/kaizencycle/Mobius-Substrate/pull/380) with the block below.
The auto-generated body uses the wrong header (`## EPICON Intent`), wrong `ledger_id`, and
omits `expires_at` — EPICON Guard will keep failing until this is pasted.

Branch `canon/reserve-blocks-prime-c368` already includes scope fix `fe7754a3`
(`canon/` in specs envelope).

---

```markdown
## EPICON-02 INTENT PUBLICATION

```intent
epicon_id: EPICON_C-368_SPECS_reserve-canon-prime_v1
ledger_id: mobius:kaizencycle
scope: specs
mode: normal
issued_at: 2026-07-12T18:50:08.462Z
expires_at: 2026-10-10T18:50:08.462Z
justification: |
  Prime cold canon export of 194 Reserve Blocks from hot KV to canon/reserve-blocks/.
  Chain verified before PR open (9700 MIC). 313 attested seals deduped to 194 unique
  block_numbers per C-370 collision audit — see mobius-civic-ai-terminal
  docs/epicon/cycles/C-370/AUDIT_C-370_reserve-block-collisions.md.

  VALUES INVOKED: integrity, custodianship, permanence
  REASONING: Hot KV holds attested seals; cold .dat canon on Substrate is the durable
  attestation layer per C-357/C-368.
  ANCHORS:
  - MOBIUS_RESERVE_BLOCK_DAT.md
  - .github/workflows/reserve-block-canonization.yml
  - docs/epicon/cycles/C-368/C368-PR7_reserve-canon-prime.md
  BOUNDARIES: Canonizes sealed blocks as-is; excludes in-progress block.
counterfactuals:
  - If chain verification fails, do not merge until KV audit completes
  - If MANIFEST total_blocks disagrees with verify-dat-chain.js, halt and re-export
```

## Canon snapshot

- total_blocks: 194
- total_mic: 9700
- chain_tip_hash: `sha256:2ccc5e411828b32927bd53842558dd8202b9395955668f75237b107539d25baa`
- generated_at: 2026-07-12T18:50:08.462Z
```
