/**
 * C-410 — shared badge constants and prohibited action canon.
 */

export const HUMAN_ISSUER = 'mobius:human:michael-judan' as const;
export const HUMAN_STEWARD = 'Michael Judan' as const;
export const BADGE_ISSUED_AT = '2026-08-21T00:00:00.000Z';

/** Actions no autonomous agent may perform. Human consent flows separately. */
export const AGENT_PROHIBITED_ACTIONS = [
  'self_approve',
  'grant_human_consent',
  'authorize_execution',
  'mutate_production',
  'form_seal_unilaterally',
  'unlock_fountain',
  'mint_mic',
] as const;

export const SECRET_FIELD_PATTERNS = [
  /api[_-]?key/i,
  /private[_-]?key/i,
  /secret/i,
  /password/i,
  /bearer\s+/i,
  /sk-[a-z0-9]{8,}/i,
] as const;

export const VALID_AGENT_IDS = new Set([
  'mobius:agent:atlas',
  'mobius:agent:zeus',
  'mobius:agent:hermes',
  'mobius:agent:jade',
  'mobius:agent:eve',
  'mobius:agent:echo',
  'mobius:agent:aurea',
  'mobius:agent:daedalus',
  'mobius:agent:zenith',
  'mobius:agent:uriel',
  'mobius:human:michael-judan',
]);

export const AUTHORIZATION_STATE_ORDER = [
  'REGISTERED',
  'BADGED',
  'ASSIGNED',
  'ATTESTED',
  'QUORUM_REACHED',
  'HUMAN_APPROVED',
  'EXECUTION_AUTHORIZED',
  'EXPIRED_OR_REVOKED',
] as const;
