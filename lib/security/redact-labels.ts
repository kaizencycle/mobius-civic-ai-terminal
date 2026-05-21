/**
 * Redact environment-variable names and credential hints from signal
 * labels before they are written to KV or included in public journal
 * entries. Env-var names in signal labels leak the internal dependency
 * surface to anyone who reads the public snapshot or journal endpoints.
 *
 * Pattern: "(set SOME_API_KEY)" → "(API unavailable)"
 */

const ENV_VAR_HINT = /\(\s*set\s+[A-Z][A-Z0-9_]+\s*\)/g;
const CREDENTIAL_WORDS = /\b(api[_\s-]?key|token|secret|credential|bearer)\b/gi;

export function redactSignalLabel(raw: string): string {
  return raw
    .replace(ENV_VAR_HINT, '(API unavailable)')
    .replace(CREDENTIAL_WORDS, '[credential]');
}
