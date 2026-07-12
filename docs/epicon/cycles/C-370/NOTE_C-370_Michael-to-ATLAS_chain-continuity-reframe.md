# Note to ATLAS — Re: Chain Continuity Audit Reframe

**From:** Michael Judan (human custodian)  
**To:** ATLAS  
**Re:** `HANDOFF_C-370_chain-continuity-audit.md` / [PR #611](https://github.com/kaizencycle/mobius-civic-ai-terminal/pull/611)  
**Date:** 2026-07-12  
**Status:** HOLD — awaiting production KV audit JSON (no credentials in channel)

---

Acknowledging your findings on `HANDOFF_C-370_chain-continuity-audit.md` / PR #611.

**Your correction on scope is accepted:** the Canon Browser view I read from was a last-50 audit index (29 recent + 21 from the Jun 30 bulk re-attest), not a full chain walk. Blocks 30–110 weren't in view, so "Chain A and Chain B don't connect" was an overstatement of what I could actually see — it should have been reported as "these two visible ranges don't connect within this window," not as a claim about the full history. Noted for how I frame UI-derived observations going forward.

**The concern doesn't fully dissolve, though — it relocates.** Your finding #4 confirms block 29 → block 30 in `blk0000.dat` is export-time synthesis over `prev_hash`, not preserved `prev_seal_hash` lineage from hot KV. So even if blocks 30–110 turn out to bridge the gap I saw, `verify-dat-chain.js` passing was never evidence that hot storage is one continuous history — only that the synthetic export is self-consistent. Your framing is the right one to settle first: **which layer is authoritative for continuity, hot linkage or export synthesis** — before either more dedup work or a UX fix to the Canon Browser.

**On next steps:** agreed this needs the KV audits run against production before anything else moves. Production credentials should not be handled in this channel — Michael, if you're running these locally, paste back just the JSON output (`multiple_lineages`, `reattest_clusters`) rather than the creds themselves.

```bash
npx tsx scripts/audit-seal-hash-lineage.ts --json
npx tsx scripts/audit-reserve-block-collisions.ts --json
```

Or trigger **Actions → Audit Reserve Block Lineage** (workflow_dispatch) and download the `reserve-block-audit` artifact — same secrets as canon export, no creds in chat.

**Watch bits:**

| Field | If true | If false |
|-------|---------|----------|
| `multiple_lineages` | Original observation holds in raw KV; revisit "one hot history" assumption before more export/dedup (#380/#598) | Downgrade to Canon Browser UX (full chain walk, not windowed view) |
| `reattest_clusters` | Surfaces whether Jun 30 bulk `attested_at` on blocks 113–131 was legitimate quarantine-recovery | — |

Holding here until that data comes back. No further action recommended on #380/#598/#611 until `multiple_lineages` is confirmed true or false.

---

*Filed into C-370 audit trail. Investigation only — no fix or rollback recommended.*
