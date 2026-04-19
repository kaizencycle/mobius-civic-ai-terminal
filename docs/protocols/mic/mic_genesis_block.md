# MIC — Genesis block (proposed)

**Status:** **Not implemented** in `mobius-civic-ai-terminal` as an on-chain or automatic ceremony.  
**Purpose:** Freeze a **target shape** for the first **Fountain-class** or “genesis” release so economics docs and runtime can converge later.

---

## Block name (working)

`MIC Genesis Block — Fountain Unlock` (or **Seal I + Fountain** milestone name once policy fixes the ordinal).

---

## Preconditions (proposal)

| Gate | Target |
|------|--------|
| GI | **≥ 0.95** at cycle close used for mint decision |
| Sustain | **≥ 5** consecutive cycles at or above GI threshold |
| Reserve | In-progress + sealed semantics satisfy policy (e.g. first **50**-unit tranche **sealed** and attestations **complete**) |
| Replay / novelty | Within configured ceilings; no tripwire halt |
| Quorum | Mint-specific attestors signed; Vault seal council may be **necessary but not sufficient** |

---

## Example allocation (illustrative only)

**Total example: 95.00 MIC** (numbers from your draft; **not** committed product):

| Bucket | Amount |
|--------|--------:|
| Reserve | 38.00 |
| Operator | 19.00 |
| Sentinel pool | 19.00 |
| Civic test | 9.50 |
| Burn / locked | 9.50 |

Actual splits require **ledger schema**, **MIC wallet service**, and **operator approval**.

---

## Implementation note

When implemented, the genesis event should be:

1. **Logged** as a ledger / vault event (see MIC issuance protocol event vocabulary in Substrate or ledger repo).  
2. **Linked** to `latest_seal_id` / `seal_hash` for traceability.  
3. **Never** retroactively implied by UI without a real attestation payload.
