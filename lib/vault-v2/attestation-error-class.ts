// C-330 — distinguish a SERVER-CONFIG attestation failure from a real per-seal
// failure, so config errors never burn a seal's retry budget.
//
// ROOT CAUSE (confirmed in Civic-Protocol-Core ledger/app/main.py:100-112):
//   The terminal attests with lab_source "terminal". CPC routes "terminal" →
//   IDENTITY_API_BASE for token introspection. IDENTITY_API_BASE defaults to ""
//   on the Render ledger deploy, so every terminal attestation receives:
//   400 {"detail":"No API base configured for terminal"}.
//   This is a server env problem, not a per-seal problem — retrying the same
//   seal cannot succeed until IDENTITY_API_BASE is set on Render.
//
// THE BUG THIS FIXES (app/api/cron/reattest-seals/route.ts):
//   The reattest cron counts every failed attempt toward MAX_REATTEST_ATTEMPTS
//   (12) and then marks the seal permanently-failed. Because the config 400
//   fails all 12, healthy seals get falsely marked permanently-failed — which
//   is exactly why a hand-maintained LEGACY_SEAL_KV_RESET_IDS list (49 entries,
//   C-288 → C-307) exists to un-stick them after env fixes.
//
//   By classifying config-class errors and NOT counting them against the cap,
//   affected seals stay retryable and auto-resume when IDENTITY_API_BASE is set.

export type AttestationErrorClass = 'config' | 'transient' | 'permanent';

// Substrings identifying a CPC server-configuration failure. Case-insensitive.
const CONFIG_ERROR_SIGNATURES = [
  'no api base configured', // CPC main.py:112 — IDENTITY_API_BASE unset
  'unknown lab source',     // CPC main.py:109 — routing misconfig
  'token verification failed', // C-357 — wrong bearer (AGENT_SERVICE_TOKEN) or identity creds unset
  'identity_service_email',    // explicit mint failure when creds missing/invalid
] as const;

// Substrings identifying a transient/retryable failure. SHOULD count toward cap.
const TRANSIENT_ERROR_SIGNATURES = [
  'timeout',
  'timed out',
  'etimedout',
  'econnreset',
  'econnrefused',
  'enotfound',
  'eai_again',
  'fetch failed',
  'network',
  'socket hang up',
  'response not json', // Render HTML cold-start (client.ts C-296 OPT-2)
  'ledger 502',
  'ledger 503',
  'ledger 504',
  '500',
] as const;

/**
 * Classify a substrate attestation error string.
 * - 'config'    → server misconfigured; do NOT burn retry budget; auto-resumes on fix.
 * - 'transient' → retryable; counts toward the cap with backoff.
 * - 'permanent' → unrecognized; treated as a real failure (counts toward cap).
 *
 * Config is checked first so a "400" config error is never misread as transient.
 */
export function classifyAttestationError(error: string | null | undefined): AttestationErrorClass {
  if (!error) return 'permanent';
  const e = error.toLowerCase();
  if (CONFIG_ERROR_SIGNATURES.some((sig) => e.includes(sig))) return 'config';
  if (TRANSIENT_ERROR_SIGNATURES.some((sig) => e.includes(sig))) return 'transient';
  return 'permanent';
}

/** True when the error is a server-config class failure that should not count
 *  toward the permanent-fail cap. */
export function isConfigClassError(error: string | null | undefined): boolean {
  return classifyAttestationError(error) === 'config';
}
