# Track R Live Dry-Run Report (C-403)

**Capture ID:** `track-r-c403-2026-08-14T1920Z`  
**Captured:** 2026-08-14T19:20:00.526Z  
**Executive status:** **BLOCKED**  
**Execution authorized:** **NOT AUTHORIZED**  
**Production mutation:** **NONE**

---

## 1. Summary

Single capture (`track-r-c403-2026-08-14T1920Z`). Dry-run only. **Semantic manifest hash** excludes volatile telemetry. Snapshot split: **lineage** (CAS gate) vs **telemetry** (informational). Positions 132–194 are **verified_unattached** — no fabricated 131→132 edge.

Fail-closed corrections (post PR #654): process exit code matches executive status; affected-block set compared exactly (not collision count alone); authenticated live witness export attempted when credentials available.

---

## 2. Production snapshot

| Field | Observed |
|---|---|
| Capture ID | `track-r-c403-2026-08-14T1920Z` |
| Lineage snapshot hash | `2fba50aa07d4b79ba7891626b58a0be425088adc50ce3d48598ad894555cb8e7` |
| Telemetry snapshot hash | `20a7cb5f4a9f5d08d1735d9417104f0413c8f78eac1288712e26fb827f84e076` |
| Execution witness hash | `n/a` |
| Unsealed accumulator | ~2556.656328 MIC |
| Collision pairs | 125 |
| Affected block set match | false |
| Integrity gate | active |

### Drift vs handoff

- **contested_block_positions**: material
- **unsealed_accumulator_mic_approx**: info

Accumulator drift is **telemetry only** — must not block lineage CAS.

### Affected-block set comparison

```json
{
  "set_match": false,
  "missing_from_live": [
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
    16,
    17,
    18,
    19,
    20,
    21,
    22,
    23,
    24,
    25,
    26,
    27,
    28,
    29,
    30,
    31,
    32,
    33,
    42,
    43,
    44,
    45,
    46,
    47,
    48,
    49,
    50,
    51,
    52,
    53,
    54,
    55,
    56,
    57,
    58,
    59,
    60,
    61,
    62,
    63,
    64,
    65,
    66,
    67,
    68,
    69,
    70,
    71,
    72,
    73,
    74,
    75,
    76,
    77,
    78,
    79,
    80,
    81,
    82,
    83,
    84,
    85,
    86,
    87,
    88,
    89,
    90,
    91,
    92,
    93,
    94,
    95,
    96,
    97,
    98,
    99,
    100,
    101,
    102,
    103,
    104,
    105,
    106,
    107,
    108,
    109,
    110,
    111,
    112,
    113,
    114,
    115,
    116,
    117,
    118,
    119,
    120,
    121,
    122,
    123,
    124,
    125,
    126,
    127,
    128,
    129,
    130,
    131
  ],
  "unexpected_in_live": [],
  "duplicate_live_positions": []
}
```

---

## 3. Dry-run

| Field | Value |
|---|---|
| Semantic manifest hash | `27c94b0f5b4e870ca3ba353368a8b11e5001166cbd3baee37cb11ea6a47b3eaa` |
| Rollback manifest hash | `0a61a3ff9cd98eb8606dee9040b963b27bec5bd8cacd175977badd378ebf0d8d` |
| Promoted through | position 131 (`seal-C-358-131`) |
| 132–194 | verified_unattached |
| 131→132 edge | not_fabricated |

---

## 4. Execution witness

| Field | Value |
|---|---|
| Authenticated read | false |
| Export complete | false |
| Expected universe | 0 |
| Blocked reason | BLOCKED_KV_ENVIRONMENT_IDENTITY_MISMATCH |
| Summary | n/a |

See `artifacts/C-403/track-r-live-dry-run/TRACK_R_LIVE_WITNESS_COMPARISON_REDACTED.json`.

---

## 5. Execution authorization

**Track R execution status: NOT AUTHORIZED.**
