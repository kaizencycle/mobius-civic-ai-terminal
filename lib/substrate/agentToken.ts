// C-339 PR-C item 15: extracted so getAgentBearerToken is directly unit-testable.
//
// Kept dependency-free (no '@/' alias imports) so the contract test can import
// it under tsx without alias resolution. lib/substrate/client.ts re-exports it,
// so existing importers ('@/lib/substrate/client') are unaffected.
//
// Precedence (C-333 OPT-1): the outbound ledger bearer is the runtime Identity
// JWT in AGENT_SERVICE_TOKEN, falling back to RENDER_API_KEY. The internal cron
// secret SUBSTRATE_TOKEN must NEVER be used here — introspection rejects it.

export function getAgentBearerToken(): string {
  const primary = process.env.AGENT_SERVICE_TOKEN?.trim() ?? '';
  if (primary.length > 0) return primary;
  return process.env.RENDER_API_KEY?.trim() ?? '';
}
