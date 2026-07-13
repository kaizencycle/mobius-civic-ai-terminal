# C-371 Adversarial Hash Verification — ZEUS Lane

**Role:** Independent re-verification (ATLAS execution pending ZEUS attestation)  
**Date:** 2026-07-13T14:47:08Z  
**Method:** Fresh production API fetch + local `computeSealHash` ×2 (no cached artifacts)

---

## Procedure

1. `GET https://mobius-civic-ai-terminal.vercel.app/api/vault/seal/seal-C-307-041`
2. `GET https://mobius-civic-ai-terminal.vercel.app/api/vault/seal/seal-C-308-042`
3. Recompute `seal-C-307-041` hash via `lib/vault-v2/seal.ts` twice independently
4. Compare against expected `2e03823c2d2145596d2a08afe8832ef10b27c19f8337d597c82d7efc1604c758`
5. Confirm `seal-C-308-042.prev_seal_hash` equals recovered `seal-C-307-041.seal_hash`

---

## Result

```json
{
  "verified_at": "2026-07-13T14:47:08.989Z",
  "api_hash_valid_307": true,
  "api_hash_valid_308": true,
  "s307_status": "promoted",
  "s307_stored_hash": "2e03823c2d2145596d2a08afe8832ef10b27c19f8337d597c82d7efc1604c758",
  "recompute_run1": "2e03823c2d2145596d2a08afe8832ef10b27c19f8337d597c82d7efc1604c758",
  "recompute_run2": "2e03823c2d2145596d2a08afe8832ef10b27c19f8337d597c82d7efc1604c758",
  "recompute_identical": true,
  "verifySealHash_307": true,
  "verifySealHash_308": true,
  "hash_match_expected": true,
  "s308_prev": "2e03823c2d2145596d2a08afe8832ef10b27c19f8337d597c82d7efc1604c758",
  "boundary_link": true
}
```

**Verdict:** PASS — no API body transformation detected; canonicalization unchanged; boundary link confirmed.

**ZEUS attestation:** Pending formal ZEUS catalog entry.
