/**
 * C-410 — Agent Badge and Stewardship Registry types.
 * Phase 1: canon + schema + read-only validation. Execution disabled.
 */

export const AGENT_BADGE_SCHEMA_VERSION = '0.1' as const;
export const JOB_CAPABILITY_SCHEMA_VERSION = '0.1' as const;
export const JOB_ROUTING_SCHEMA_VERSION = '0.1' as const;
export const AUTHORIZATION_STATE_SCHEMA_VERSION = '0.1' as const;

export type BadgeType =
  | 'steward'
  | 'independent_verifier'
  | 'market_analyst'
  | 'narrative_steward'
  | 'civic_guardian'
  | 'signal_observer'
  | 'strategic_synthesizer'
  | 'research_architect'
  | 'cross_system_reviewer'
  | 'contrarian_analyst'
  | 'human_authority';

export type RevocationStatus = 'active' | 'revoked' | 'expired';

export type AuthorizationStateLabel =
  | 'REGISTERED'
  | 'BADGED'
  | 'ASSIGNED'
  | 'ATTESTED'
  | 'QUORUM_REACHED'
  | 'HUMAN_APPROVED'
  | 'EXECUTION_AUTHORIZED'
  | 'EXPIRED_OR_REVOKED';

export type AgentBadge = {
  schema_version: typeof AGENT_BADGE_SCHEMA_VERSION;
  agent_id: string;
  display_name: string;
  badge_type: BadgeType;
  primary_domains: string[];
  core_function: string;
  permitted_actions: string[];
  prohibited_actions: string[];
  issuer: 'mobius:human:michael-judan';
  issued_at: string;
  expires_at: string | null;
  revocation_status: RevocationStatus;
  public_key_id: string | null;
  human_steward: 'Michael Judan';
  execution_authority: false;
  mic_mechanism: false;
};

export type JobCapability = {
  schema_version: typeof JOB_CAPABILITY_SCHEMA_VERSION;
  capability_id: string;
  cycle: string;
  agent_id: string;
  job_id: string;
  evidence_hash: string;
  permitted_action: string;
  scope: string[];
  issued_at: string;
  expires_at: string;
  revoked: boolean;
  execution_authority: false;
};

export type GovernedJob = {
  schema_version: typeof JOB_ROUTING_SCHEMA_VERSION;
  job_id: string;
  cycle: string;
  surface: string;
  domain: string;
  steward: string;
  contributors: string[];
  verifier: string;
  guardian: string;
  human_approver: string;
  evidence_hash: string;
  quorum_satisfied: boolean;
  human_approval: boolean;
  execution_authorized: boolean;
};

export type AttestationRecord = {
  agent_id: string;
  job_id: string;
  evidence_hash: string;
  conclusion: string;
  attested_at: string;
  builder_of_change?: boolean;
};

export type WitnessProvenance = {
  agent_id: string;
  model_provenance?: string | null;
  evidence_sources?: string[];
  organizational_role?: string;
  builder_of_change?: boolean;
  shared_process_id?: string | null;
};

export type AuthorizationPosture = {
  schema_version: typeof AUTHORIZATION_STATE_SCHEMA_VERSION;
  job_id: string;
  evidence_hash: string;
  state: AuthorizationStateLabel;
  badge_valid: boolean;
  capability_valid: boolean;
  attestations_valid: boolean;
  quorum_satisfied: boolean;
  quorum_status?: string;
  human_approval: boolean;
  execution_authorized: boolean;
  authority_source: 'canon_registry' | 'terminal_renderer';
  execution_grant?: ExecutionGrant | null;
  mic_created: false;
};

export type ExecutionGrant = {
  exact_action: string;
  exact_scope: string[];
  evidence_hash: string;
  issuing_human: string;
  issued_at: string;
  expires_at: string;
  rollback_condition: string;
  revocation_status: RevocationStatus;
};

export type ValidationResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

export type SurfaceStewardshipRow = {
  surface: string;
  steward: string;
  contributors: string[];
  verifier: string;
  guardian: string;
};
