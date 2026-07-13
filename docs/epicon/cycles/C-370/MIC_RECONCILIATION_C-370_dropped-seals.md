# MIC Ledger Reconciliation — C-370 Dropped Seals

**Purpose:** For each of the 119 seals discarded during dedupe (kept one seal per
`block_number`, dropped the other), confirm whether MIC or any user-facing reward was
ever credited against the **dropped** `seal_id`. This is a data lookup, not a policy
decision — see [`GOVERNANCE_DECISION_C-370_chain-continuity.md`](./GOVERNANCE_DECISION_C-370_chain-continuity.md) Question 3 for the
decision this checklist feeds into.

**Source:** `collision-audit.json`, PR #611 workflow run, 2026-07-13T00:00:16Z.  
**Total seals to check:** 119

---

## What "credited / not credited / reversed" means

For each `dropped_seal_id` below, query the MIC ledger / vault deposit history and mark one of:

- **NOT_CREDITED** — no MIC deposit or reward event references this `seal_id` anywhere in the ledger. Clean.
- **CREDITED_RECONCILED** — a credit exists, but there is clear evidence it was later reversed, clawed back, or superseded by the kept seal's own credit (cite the reversal record).
- **CREDITED_UNRECONCILED** — a credit exists tied to this `seal_id` and there is no evidence it was ever reversed or reconciled. **This is the finding that requires follow-up** — do not attempt remediation here, just flag it.
- **UNKNOWN** — could not determine from available records. Note what's missing (e.g., ledger predates current retention window).

## Suggested query approach

For each `dropped_seal_id`, check:

1. Vault/ledger deposit records referencing the seal_id or its `civic_id`/`entry_id` equivalents from that time window (`dropped_sealed_at`).
2. Substrate ledger `evt_*` entries around the `dropped_sealed_at` timestamp for the corresponding `dropped_cycle`.
3. Any MIC balance snapshot from that period, if retained, to check if the deposit amount at that time is explainable without this seal.

Given the volume (119), consider scripting this as a batch job against the ledger API rather
than checking one at a time — but keep the same NOT_CREDITED / CREDITED_RECONCILED /
CREDITED_UNRECONCILED / UNKNOWN categorization per seal so results stay auditable.

---

## Checklist (119 seals)

| # | block | dropped_seal_id | dropped_cycle | dropped_sealed_at | kept_seal_id (for reference) | Result |
|---|---|---|---|---|---|---|
| 1 | 1 | seal-C-332-001 | C-332 | 2026-06-05T04:51:24.579Z | seal-C-359-001 | ☐ |
| 2 | 2 | seal-C-333-002 | C-333 | 2026-06-05T10:04:35.629Z | seal-C-359-002 | ☐ |
| 3 | 3 | seal-C-333-003 | C-333 | 2026-06-05T15:50:53.934Z | seal-C-359-003 | ☐ |
| 4 | 4 | seal-C-333-004 | C-333 | 2026-06-05T21:40:54.262Z | seal-C-360-004 | ☐ |
| 5 | 5 | seal-C-333-005 | C-333 | 2026-06-05T21:45:30.855Z | seal-C-360-005 | ☐ |
| 6 | 6 | seal-C-333-006 | C-333 | 2026-06-06T03:10:53.867Z | seal-C-360-006 | ☐ |
| 7 | 7 | seal-C-334-007 | C-334 | 2026-06-06T09:00:54.279Z | seal-C-361-007 | ☐ |
| 8 | 8 | seal-C-334-008 | C-334 | 2026-06-06T14:50:54.490Z | seal-C-361-008 | ☐ |
| 9 | 9 | seal-C-334-009 | C-334 | 2026-06-06T14:55:30.771Z | seal-C-362-009 | ☐ |
| 10 | 10 | seal-C-334-010 | C-334 | 2026-06-06T20:20:53.990Z | seal-C-362-010 | ☐ |
| 11 | 11 | seal-C-334-011 | C-334 | 2026-06-07T02:10:46.942Z | seal-C-362-011 | ☐ |
| 12 | 12 | seal-C-335-012 | C-335 | 2026-06-07T08:10:49.468Z | seal-C-363-012 | ☐ |
| 13 | 13 | seal-C-335-013 | C-335 | 2026-06-07T08:15:30.664Z | seal-C-363-013 | ☐ |
| 14 | 14 | seal-C-335-014 | C-335 | 2026-06-07T14:02:30.455Z | seal-C-363-014 | ☐ |
| 15 | 15 | seal-C-335-015 | C-335 | 2026-06-07T20:02:05.542Z | seal-C-364-015 | ☐ |
| 16 | 16 | seal-C-335-016 | C-335 | 2026-06-08T01:50:53.790Z | seal-C-364-016 | ☐ |
| 17 | 17 | seal-C-336-017 | C-336 | 2026-06-08T08:01:30.547Z | seal-C-365-017 | ☐ |
| 18 | 18 | seal-C-336-018 | C-336 | 2026-06-08T08:05:30.581Z | seal-C-365-018 | ☐ |
| 19 | 19 | seal-C-336-019 | C-336 | 2026-06-08T14:01:51.686Z | seal-C-365-019 | ☐ |
| 20 | 20 | seal-C-336-020 | C-336 | 2026-06-08T14:05:30.869Z | seal-C-366-020 | ☐ |
| 21 | 21 | seal-C-336-021 | C-336 | 2026-06-08T20:04:15.848Z | seal-C-366-021 | ☐ |
| 22 | 22 | seal-C-336-022 | C-336 | 2026-06-08T20:10:17.791Z | seal-C-367-022 | ☐ |
| 23 | 23 | seal-C-336-023 | C-336 | 2026-06-09T02:03:55.998Z | seal-C-367-023 | ☐ |
| 24 | 24 | seal-C-336-024 | C-336 | 2026-06-09T02:05:17.391Z | seal-C-368-024 | ☐ |
| 25 | 25 | seal-C-337-025 | C-337 | 2026-06-09T08:01:02.626Z | seal-C-368-025 | ☐ |
| 26 | 26 | seal-C-337-026 | C-337 | 2026-06-09T08:05:17.420Z | seal-C-369-026 | ☐ |
| 27 | 27 | seal-C-337-027 | C-337 | 2026-06-09T14:01:01.677Z | seal-C-369-027 | ☐ |
| 28 | 28 | seal-C-337-028 | C-337 | 2026-06-09T19:51:14.427Z | seal-C-369-028 | ☐ |
| 29 | 29 | seal-C-337-029 | C-337 | 2026-06-10T01:31:14.172Z | seal-C-370-029 | ☐ |
| 30 | 42 | seal-C-308-042 | C-308 | 2026-05-11T07:51:02.451Z | seal-C-339-042 | ☐ **(orphan_prev — see Q1)** |
| 31 | 43 | seal-C-308-043 | C-308 | 2026-05-11T14:51:15.853Z | seal-C-340-043 | ☐ |
| 32 | 44 | seal-C-308-044 | C-308 | 2026-05-11T14:55:46.437Z | seal-C-340-044 | ☐ |
| 33 | 45 | seal-C-308-045 | C-308 | 2026-05-11T22:01:03.397Z | seal-C-340-045 | ☐ |
| 34 | 46 | seal-C-309-046 | C-309 | 2026-05-12T05:01:17.290Z | seal-C-340-046 | ☐ |
| 35 | 47 | seal-C-309-047 | C-309 | 2026-05-12T12:01:20.484Z | seal-C-340-047 | ☐ |
| 36 | 48 | seal-C-309-048 | C-309 | 2026-05-12T19:11:20.197Z | seal-C-340-048 | ☐ |
| 37 | 49 | seal-C-309-049 | C-309 | 2026-05-12T19:15:46.521Z | seal-C-341-049 | ☐ |
| 38 | 50 | seal-C-309-050 | C-309 | 2026-05-13T02:01:09.506Z | seal-C-341-050 | ☐ |
| 39 | 51 | seal-C-310-051 | C-310 | 2026-05-13T09:01:06.971Z | seal-C-341-051 | ☐ |
| 40 | 52 | seal-C-310-052 | C-310 | 2026-05-13T09:05:46.633Z | seal-C-341-052 | ☐ |
| 41 | 53 | seal-C-310-053 | C-310 | 2026-05-13T16:01:31.032Z | seal-C-341-053 | ☐ |
| 42 | 54 | seal-C-310-054 | C-310 | 2026-05-13T16:05:04.825Z | seal-C-342-054 | ☐ |
| 43 | 55 | seal-C-310-055 | C-310 | 2026-05-13T23:01:21.613Z | seal-C-342-055 | ☐ |
| 44 | 56 | seal-C-310-056 | C-310 | 2026-05-13T23:05:05.088Z | seal-C-342-056 | ☐ |
| 45 | 57 | seal-C-310-057 | C-310 | 2026-05-14T05:51:06.069Z | seal-C-342-057 | ☐ |
| 46 | 58 | seal-C-311-058 | C-311 | 2026-05-14T12:51:17.885Z | seal-C-342-058 | ☐ |
| 47 | 59 | seal-C-311-059 | C-311 | 2026-05-14T19:51:26.798Z | seal-C-343-059 | ☐ |
| 48 | 60 | seal-C-311-060 | C-311 | 2026-05-14T19:55:04.615Z | seal-C-343-060 | ☐ |
| 49 | 61 | seal-C-311-061 | C-311 | 2026-05-15T02:41:29.565Z | seal-C-343-061 | ☐ |
| 50 | 62 | seal-C-311-062 | C-311 | 2026-05-15T02:45:04.987Z | seal-C-343-062 | ☐ |
| 51 | 63 | seal-C-312-063 | C-312 | 2026-05-15T09:41:04.169Z | seal-C-343-063 | ☐ |
| 52 | 64 | seal-C-312-064 | C-312 | 2026-05-15T09:45:04.722Z | seal-C-343-064 | ☐ |
| 53 | 65 | seal-C-312-065 | C-312 | 2026-05-15T16:41:37.138Z | seal-C-343-065 | ☐ |
| 54 | 66 | seal-C-312-066 | C-312 | 2026-05-15T22:31:15.206Z | seal-C-344-066 | ☐ |
| 55 | 67 | seal-C-312-067 | C-312 | 2026-05-15T22:35:05.821Z | seal-C-344-067 | ☐ |
| 56 | 68 | seal-C-312-068 | C-312 | 2026-05-16T04:21:18.128Z | seal-C-344-068 | ☐ |
| 57 | 69 | seal-C-312-069 | C-312 | 2026-05-16T04:25:05.859Z | seal-C-344-069 | ☐ |
| 58 | 70 | seal-C-313-070 | C-313 | 2026-05-16T10:20:43.402Z | seal-C-344-070 | ☐ |
| 59 | 71 | seal-C-313-071 | C-313 | 2026-05-16T16:21:34.472Z | seal-C-344-071 | ☐ |
| 60 | 72 | seal-C-313-072 | C-313 | 2026-05-16T22:31:12.987Z | seal-C-345-072 | ☐ |
| 61 | 73 | seal-C-314-073 | C-314 | 2026-05-17T04:41:23.751Z | seal-C-345-073 | ☐ |
| 62 | 74 | seal-C-314-074 | C-314 | 2026-05-17T04:45:05.647Z | seal-C-345-074 | ☐ |
| 63 | 75 | seal-C-314-075 | C-314 | 2026-05-17T10:40:54.767Z | seal-C-345-075 | ☐ |
| 64 | 76 | seal-C-314-076 | C-314 | 2026-05-17T16:41:24.313Z | seal-C-345-076 | ☐ |
| 65 | 77 | seal-C-314-077 | C-314 | 2026-05-17T16:45:16.368Z | seal-C-346-077 | ☐ |
| 66 | 78 | seal-C-314-078 | C-314 | 2026-05-17T22:21:06.996Z | seal-C-346-078 | ☐ |
| 67 | 79 | seal-C-314-079 | C-314 | 2026-05-17T22:25:30.563Z | seal-C-346-079 | ☐ |
| 68 | 80 | seal-C-314-080 | C-314 | 2026-05-18T03:31:07.887Z | seal-C-346-080 | ☐ |
| 69 | 81 | seal-C-315-081 | C-315 | 2026-05-18T09:11:07.405Z | seal-C-346-081 | ☐ |
| 70 | 82 | seal-C-315-082 | C-315 | 2026-05-18T09:15:30.684Z | seal-C-347-082 | ☐ |
| 71 | 83 | seal-C-315-083 | C-315 | 2026-05-18T15:01:06.767Z | seal-C-347-083 | ☐ |
| 72 | 84 | seal-C-315-084 | C-315 | 2026-05-18T20:20:59.810Z | seal-C-347-084 | ☐ |
| 73 | 85 | seal-C-315-085 | C-315 | 2026-05-18T20:25:23.753Z | seal-C-347-085 | ☐ |
| 74 | 86 | seal-C-315-086 | C-315 | 2026-05-19T02:11:00.420Z | seal-C-347-086 | ☐ |
| 75 | 87 | seal-C-315-087 | C-315 | 2026-05-19T02:15:23.457Z | seal-C-348-087 | ☐ |
| 76 | 88 | seal-C-316-088 | C-316 | 2026-05-19T08:02:41.703Z | seal-C-348-088 | ☐ |
| 77 | 89 | seal-C-316-089 | C-316 | 2026-05-19T13:50:59.752Z | seal-C-348-089 | ☐ |
| 78 | 90 | seal-C-316-090 | C-316 | 2026-05-19T19:31:00.142Z | seal-C-348-090 | ☐ |
| 79 | 91 | seal-C-316-091 | C-316 | 2026-05-19T19:35:23.864Z | seal-C-348-091 | ☐ |
| 80 | 92 | seal-C-316-092 | C-316 | 2026-05-20T01:02:58.354Z | seal-C-348-092 | ☐ |
| 81 | 93 | seal-C-316-093 | C-316 | 2026-05-20T01:05:23.369Z | seal-C-349-093 | ☐ |
| 82 | 94 | seal-C-317-094 | C-317 | 2026-05-20T06:20:59.949Z | seal-C-349-094 | ☐ |
| 83 | 95 | seal-C-317-095 | C-317 | 2026-05-20T12:02:57.103Z | seal-C-349-095 | ☐ |
| 84 | 96 | seal-C-317-096 | C-317 | 2026-05-20T12:05:23.603Z | seal-C-349-096 | ☐ |
| 85 | 97 | seal-C-317-097 | C-317 | 2026-05-20T12:10:23.810Z | seal-C-349-097 | ☐ |
| 86 | 98 | seal-C-317-098 | C-317 | 2026-05-20T17:41:06.467Z | seal-C-349-098 | ☐ |
| 87 | 99 | seal-C-317-099 | C-317 | 2026-05-20T17:45:08.544Z | seal-C-349-099 | ☐ |
| 88 | 100 | seal-C-317-100 | C-317 | 2026-05-20T23:21:07.125Z | seal-C-350-100 | ☐ |
| 89 | 101 | seal-C-317-101 | C-317 | 2026-05-20T23:25:08.482Z | seal-C-350-101 | ☐ |
| 90 | 102 | seal-C-317-102 | C-317 | 2026-05-21T04:51:05.537Z | seal-C-350-102 | ☐ |
| 91 | 103 | seal-C-318-103 | C-318 | 2026-05-21T04:55:08.334Z | seal-C-350-103 | ☐ |
| 92 | 104 | seal-C-318-104 | C-318 | 2026-05-21T10:21:05.922Z | seal-C-350-104 | ☐ |
| 93 | 105 | seal-C-318-105 | C-318 | 2026-05-21T16:02:38.317Z | seal-C-350-105 | ☐ |
| 94 | 106 | seal-C-318-106 | C-318 | 2026-05-21T21:50:37.224Z | seal-C-351-106 | ☐ |
| 95 | 107 | seal-C-318-107 | C-318 | 2026-05-21T21:50:39.100Z | seal-C-351-107 | ☐ |
| 96 | 108 | seal-C-318-108 | C-318 | 2026-05-22T03:21:20.147Z | seal-C-351-108 | ☐ |
| 97 | 109 | seal-C-318-109 | C-318 | 2026-05-22T03:25:49.484Z | seal-C-351-109 | ☐ |
| 98 | 110 | seal-C-319-110 | C-319 | 2026-05-22T09:01:20.462Z | seal-C-351-110 | ☐ |
| 99 | 111 | seal-C-319-111 | C-319 | 2026-05-22T09:05:49.646Z | seal-C-351-111 | ☐ |
| 100 | 112 | seal-C-319-112 | C-319 | 2026-05-22T14:41:19.687Z | seal-C-351-112 | ☐ |
| 101 | 113 | seal-C-319-113 | C-319 | 2026-05-22T14:45:49.429Z | seal-C-352-113 | ☐ |
| 102 | 114 | seal-C-319-114 | C-319 | 2026-05-22T20:21:22.275Z | seal-C-352-114 | ☐ |
| 103 | 115 | seal-C-319-115 | C-319 | 2026-05-22T20:25:07.503Z | seal-C-352-115 | ☐ |
| 104 | 116 | seal-C-319-116 | C-319 | 2026-05-23T01:41:22.304Z | seal-C-352-116 | ☐ |
| 105 | 117 | seal-C-320-117 | C-320 | 2026-05-23T07:31:21.560Z | seal-C-352-117 | ☐ |
| 106 | 118 | seal-C-320-118 | C-320 | 2026-05-23T13:21:21.941Z | seal-C-352-118 | ☐ |
| 107 | 119 | seal-C-320-119 | C-320 | 2026-05-23T13:25:07.679Z | seal-C-352-119 | ☐ |
| 108 | 120 | seal-C-320-120 | C-320 | 2026-05-23T19:01:22.244Z | seal-C-353-120 | ☐ |
| 109 | 121 | seal-C-320-121 | C-320 | 2026-05-23T19:05:40.474Z | seal-C-353-121 | ☐ |
| 110 | 122 | seal-C-320-122 | C-320 | 2026-05-24T00:40:50.403Z | seal-C-355-122 | ☐ |
| 111 | 123 | seal-C-321-123 | C-321 | 2026-05-24T06:20:49.977Z | seal-C-355-123 | ☐ |
| 112 | 124 | seal-C-321-124 | C-321 | 2026-05-24T12:03:34.829Z | seal-C-356-124 | ☐ |
| 113 | 125 | seal-C-321-125 | C-321 | 2026-05-24T12:05:40.628Z | seal-C-356-125 | ☐ |
| 114 | 126 | seal-C-321-126 | C-321 | 2026-05-24T17:51:18.751Z | seal-C-357-126 | ☐ |
| 115 | 127 | seal-C-321-127 | C-321 | 2026-05-24T17:55:11.668Z | seal-C-357-127 | ☐ |
| 116 | 128 | seal-C-321-128 | C-321 | 2026-05-24T23:31:19.205Z | seal-C-357-128 | ☐ |
| 117 | 129 | seal-C-322-129 | C-322 | 2026-05-25T05:11:19.876Z | seal-C-358-129 | ☐ |
| 118 | 130 | seal-C-322-130 | C-322 | 2026-05-25T14:02:19.283Z | seal-C-358-130 | ☐ |
| 119 | 131 | seal-C-322-131 | C-322 | 2026-05-25T19:50:35.856Z | seal-C-358-131 | ☐ |

---

## Rollup (fill in once all 119 are checked)

| Result | Count |
|---|---|
| NOT_CREDITED | |
| CREDITED_RECONCILED | |
| CREDITED_UNRECONCILED | |
| UNKNOWN | |
| **Total** | 119 |

If **CREDITED_UNRECONCILED > 0**, stop here and return to
[`GOVERNANCE_DECISION_C-370_chain-continuity.md`](./GOVERNANCE_DECISION_C-370_chain-continuity.md) Question 3 with the count and
specific seal IDs — do not attempt remediation as part of this checklist.
