# EPICON Intent Declaration

## Cycle: C-357 | Action: RESERVE_BLOCK_DAT_CANONIZATION

**Filed before action. Required by Mobius canon law.**

### Intent Statement

Canonize sealed Reserve Blocks that failed live Substrate attestation into the `.dat`
Reserve Block architecture (C-355/C-357). Creates permanent cold-canon storage in
GitHub as the distributed append-only ledger, with SHA-256 hash chain anchors posted
to CPC.

The broken `/ledger/attest` JWT path is NOT repaired by this action.

### Affected Repos

| Repo | Branch | Change Type |
|------|--------|-------------|
| mobius-civic-ai-terminal | cursor/c357-dat-canonization-a40d | Scripts + lib + API + UI |
| Civic-Protocol-Core | cursor/c357-dat-canonization-a40d | Table + 3 API routes |
| Mobius-Substrate | cursor/c357-dat-canonization-a40d | Spec doc + GH Action + canon dir |

*EPICON compliance: intent recorded before file creation.*
