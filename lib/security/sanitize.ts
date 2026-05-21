/**
 * Sanitize helpers for public-facing API payloads.
 *
 * Strip internal error strings, infrastructure flags, and enumerable
 * key names before serving to unauthenticated endpoints. All functions
 * are pure and unit-testable.
 */

/**
 * Replace the raw substrate_attestation_error string with a boolean.
 * The raw error string can contain internal ledger messages, endpoint
 * URLs, and env-var configuration hints.
 */
export function sanitizeVaultPayload(body: Record<string, unknown>): Record<string, unknown> {
  const { substrate_attestation_error, ...rest } = body;
  return {
    ...rest,
    substrate_ok: substrate_attestation_error == null,
  };
}

/**
 * Remove KV key name enumeration and third-party API presence flags.
 * Replace the `keys` map (which names every internal KV key) with a
 * single `kv_keys_ok` boolean. Remove `perplexity` (third-party flag).
 */
export function sanitizeKvHealthPayload(body: Record<string, unknown>): Record<string, unknown> {
  const { keys, perplexity, ...rest } = body;
  return {
    ...rest,
    kv_keys_ok: keys
      ? Object.values(keys as Record<string, boolean>).every(Boolean)
      : null,
  };
}

/**
 * Strip infra-detail fields from the integrity `authority` object.
 * `render_enabled` / `render_used` confirm internal infrastructure
 * configuration and are operator-only signals.
 * `payload_source` and `signal_authority` are internal chain annotations.
 * Remove `gi_verified` from the top-level payload — the unverified state
 * is an operator-only diagnostic.
 */
export function sanitizeIntegrityPayload(body: Record<string, unknown>): Record<string, unknown> {
  const { gi_verified, authority, ...rest } = body;
  void gi_verified; // intentionally dropped

  if (!authority || typeof authority !== 'object') {
    return rest;
  }

  const {
    render_enabled,
    render_used,
    payload_source,
    signal_authority,
    ...safeAuthority
  } = authority as Record<string, unknown>;
  void render_enabled;
  void render_used;
  void payload_source;
  void signal_authority;

  return { ...rest, authority: safeAuthority };
}
