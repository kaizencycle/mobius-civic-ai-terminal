/**
 * C-410 — Agent Badge validation (Phase 1–2 read-only, fail-closed).
 */

import {
  AGENT_PROHIBITED_ACTIONS,
  AUTHORIZATION_STATE_ORDER,
  SECRET_FIELD_PATTERNS,
  VALID_AGENT_IDS,
} from '@/lib/agents/badge/constants';
import { getAgentBadge } from '@/lib/agents/badge/stewardshipRegistry';
import type {
  AgentBadge,
  AttestationRecord,
  AuthorizationPosture,
  AuthorizationStateLabel,
  GovernedJob,
  JobCapability,
  ValidationResult,
  WitnessProvenance,
} from '@/lib/agents/badge/types';

const MIN_QUORUM_WITNESSES = 2;

function fail(code: string, message: string): ValidationResult {
  return { ok: false, code, message };
}

function ok(): ValidationResult {
  return { ok: true };
}

function parseIso(value: string | null | undefined): number {
  if (!value) return NaN;
  return Date.parse(value);
}

function containsSecrets(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    return SECRET_FIELD_PATTERNS.some((pattern) => pattern.test(value));
  }
  if (Array.isArray(value)) {
    return value.some(containsSecrets);
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, nested]) =>
        SECRET_FIELD_PATTERNS.some((pattern) => pattern.test(key)) || containsSecrets(nested),
    );
  }
  return false;
}

function witnessHasProvenance(witness: WitnessProvenance): boolean {
  return Boolean(witness.model_provenance) || (witness.evidence_sources?.length ?? 0) > 0;
}

export function validateAgentBadge(
  badge: AgentBadge,
  nowMs: number = Date.now(),
): ValidationResult {
  if (badge.schema_version !== '0.1') {
    return fail('schema_version', 'Unsupported agent badge schema version');
  }
  if (!VALID_AGENT_IDS.has(badge.agent_id)) {
    return fail('unknown_agent', `Unknown agent_id "${badge.agent_id}"`);
  }
  if (containsSecrets(badge)) {
    return fail('secret_in_badge', 'Badge record must not contain secrets or credentials');
  }
  if (badge.execution_authority !== false) {
    return fail('execution_authority', 'Badge must not grant execution_authority');
  }
  if (badge.mic_mechanism !== false) {
    return fail('mic_mechanism', 'Badge must not create MIC or financial balance');
  }
  if (badge.revocation_status === 'revoked' || badge.revocation_status === 'expired') {
    return fail('badge_revoked', `Badge is ${badge.revocation_status}`);
  }
  const expires = parseIso(badge.expires_at);
  if (!Number.isNaN(expires) && nowMs > expires) {
    return fail('badge_expired', 'Badge has expired');
  }
  if (badge.public_key_id !== null && badge.public_key_id.toLowerCase().includes('simulated')) {
    return fail('simulated_signature', 'Simulated signatures are forbidden');
  }
  for (const prohibited of AGENT_PROHIBITED_ACTIONS) {
    if (badge.agent_id.startsWith('mobius:agent:') && badge.permitted_actions.includes(prohibited)) {
      return fail('prohibited_permitted', `Agent badge must not permit "${prohibited}"`);
    }
  }
  return ok();
}

export function validateBadgePermitsParticipation(
  agentId: string,
  action: string,
  nowMs: number = Date.now(),
): ValidationResult {
  const badge = getAgentBadge(agentId);
  if (!badge) {
    return fail('unknown_agent', `Unknown agent_id "${agentId}"`);
  }
  const badgeCheck = validateAgentBadge(badge, nowMs);
  if (!badgeCheck.ok) return badgeCheck;
  if (badge.prohibited_actions.includes(action)) {
    return fail('prohibited_action', `Action "${action}" is prohibited for ${agentId}`);
  }
  if (!badge.permitted_actions.includes(action)) {
    return fail('action_outside_badge', `Action "${action}" is outside badge permissions`);
  }
  return ok();
}

export function validateJobCapability(
  capability: JobCapability,
  expectedEvidenceHash: string,
  nowMs: number = Date.now(),
): ValidationResult {
  if (capability.schema_version !== '0.1') {
    return fail('schema_version', 'Unsupported job capability schema version');
  }
  if (capability.execution_authority !== false) {
    return fail('execution_authority', 'Job capability must not grant execution_authority');
  }
  if (capability.revoked) {
    return fail('capability_revoked', 'Job capability is revoked');
  }
  if (capability.evidence_hash !== expectedEvidenceHash) {
    return fail('hash_mismatch', 'Capability is bound to a different evidence hash');
  }
  const expires = parseIso(capability.expires_at);
  if (Number.isNaN(expires) || nowMs > expires) {
    return fail('capability_expired', 'Job capability has expired');
  }
  const actionCheck = validateBadgePermitsParticipation(
    capability.agent_id,
    capability.permitted_action,
    nowMs,
  );
  if (!actionCheck.ok) return actionCheck;
  return ok();
}

export function validateGovernedJob(job: GovernedJob): ValidationResult {
  if (job.schema_version !== '0.1') {
    return fail('schema_version', 'Unsupported job routing schema version');
  }
  const roles = [job.steward, job.verifier, job.guardian, ...job.contributors];
  for (const role of roles) {
    if (!VALID_AGENT_IDS.has(role)) {
      return fail('unknown_agent', `Unknown routed agent "${role}"`);
    }
  }
  if (!job.human_approver.startsWith('mobius:human:')) {
    return fail('human_approver', 'human_approver must be a registered human identity');
  }
  if (job.execution_authorized && !job.human_approval) {
    return fail('missing_human_consent', 'execution_authorized requires human_approval');
  }
  if (job.quorum_satisfied && job.execution_authorized && !job.human_approval) {
    return fail('quorum_bypass', 'Quorum alone must not grant execution_authorized');
  }
  return ok();
}

export function detectSelfVerification(job: GovernedJob, attestationAgentId: string): ValidationResult {
  if (attestationAgentId === job.verifier && attestationAgentId === job.steward) {
    return fail('self_verification', 'Agent cannot verify its own stewarded implementation');
  }
  if (attestationAgentId === job.verifier && job.contributors.includes(attestationAgentId)) {
    return fail('self_verification', 'Verifier cannot verify while also listed as contributor on same job');
  }
  return ok();
}

export function detectSelfApproval(
  agentId: string,
  job: GovernedJob,
  attemptingHumanApproval: boolean,
): ValidationResult {
  if (!attemptingHumanApproval) return ok();
  if (!agentId.startsWith('mobius:agent:')) return ok();
  return fail('self_approval', 'Agents may not grant human approval on their own work');
}

export function validateQuorumIndependence(
  witnesses: WitnessProvenance[],
  requiredDomainCoverage: string[] = [],
  nowMs: number = Date.now(),
): ValidationResult {
  if (witnesses.length === 0) {
    return fail('empty_quorum', 'No witnesses supplied');
  }
  if (witnesses.length < MIN_QUORUM_WITNESSES) {
    return fail('insufficient_witnesses', `Quorum requires at least ${MIN_QUORUM_WITNESSES} eligible witnesses`);
  }

  const agentIds = witnesses.map((w) => w.agent_id);
  if (new Set(agentIds).size !== agentIds.length) {
    return fail('duplicate_witness', 'Duplicate agents cannot count as independent witnesses');
  }

  for (const witness of witnesses) {
    if (!VALID_AGENT_IDS.has(witness.agent_id)) {
      return fail('unknown_witness', `Unknown witness agent "${witness.agent_id}"`);
    }
    const badge = getAgentBadge(witness.agent_id);
    if (!badge || !validateAgentBadge(badge, nowMs).ok) {
      return fail('ineligible_witness', `Witness "${witness.agent_id}" lacks an active eligible badge`);
    }
    if (!witnessHasProvenance(witness)) {
      return fail(
        'insufficient_independence',
        `Independence cannot be established for witness "${witness.agent_id}"`,
      );
    }
  }

  const processCounts = new Map<string, number>();
  for (const witness of witnesses) {
    if (!witness.shared_process_id) continue;
    processCounts.set(
      witness.shared_process_id,
      (processCounts.get(witness.shared_process_id) ?? 0) + 1,
    );
  }
  for (const count of processCounts.values()) {
    if (count > 1) {
      return fail(
        'insufficient_independence',
        'Multiple personas backed by the same evidentiary process cannot satisfy quorum',
      );
    }
  }

  const builders = witnesses.filter((w) => w.builder_of_change);
  const verifiers = witnesses.filter((w) => w.organizational_role === 'verifier');
  for (const builder of builders) {
    if (verifiers.some((v) => v.agent_id === builder.agent_id)) {
      return fail('self_verification', 'Builder cannot serve as verifier on the same packet');
    }
  }

  if (requiredDomainCoverage.length > 0) {
    const covered = new Set(
      witnesses.flatMap((w) => w.evidence_sources ?? []).map((s) => s.toLowerCase()),
    );
    const missing = requiredDomainCoverage.filter((domain) => !covered.has(domain.toLowerCase()));
    if (missing.length > 0) {
      return fail('domain_coverage', `Quorum missing required domain coverage: ${missing.join(', ')}`);
    }
  }

  return ok();
}

function isValidAttestation(
  job: GovernedJob,
  record: AttestationRecord,
  nowMs: number,
): boolean {
  if (record.job_id !== job.job_id || record.evidence_hash !== job.evidence_hash) {
    return false;
  }
  if (!VALID_AGENT_IDS.has(record.agent_id)) {
    return false;
  }
  if (validateBadgePermitsParticipation(record.agent_id, 'issue_attestation', nowMs).ok !== true) {
    return false;
  }
  return detectSelfVerification(job, record.agent_id).ok === true;
}

export function deriveAuthorizationPosture(input: {
  job: GovernedJob;
  capabilities: JobCapability[];
  attestations: AttestationRecord[];
  witnesses: WitnessProvenance[];
  requestedState?: AuthorizationStateLabel;
  nowMs?: number;
}): AuthorizationPosture {
  const nowMs = input.nowMs ?? Date.now();
  const job = input.job;
  const posture: AuthorizationPosture = {
    schema_version: '0.1',
    job_id: job.job_id,
    evidence_hash: job.evidence_hash,
    state: 'REGISTERED',
    badge_valid: false,
    capability_valid: false,
    attestations_valid: false,
    quorum_satisfied: false,
    human_approval: false,
    execution_authorized: false,
    authority_source: 'canon_registry',
    execution_grant: null,
    mic_created: false,
  };

  if (VALID_AGENT_IDS.has(job.steward)) {
    posture.state = 'REGISTERED';
  }

  const stewardBadge = getAgentBadge(job.steward);
  posture.badge_valid =
    stewardBadge !== null && validateAgentBadge(stewardBadge, nowMs).ok === true;
  if (posture.badge_valid) {
    posture.state = 'BADGED';
  }

  const validCapabilities = input.capabilities.filter(
    (cap) =>
      cap.job_id === job.job_id &&
      validateJobCapability(cap, job.evidence_hash, nowMs).ok === true,
  );
  posture.capability_valid = validCapabilities.length > 0;
  if (posture.capability_valid) {
    posture.state = 'ASSIGNED';
  }

  const validAttestations = input.attestations.filter((record) =>
    isValidAttestation(job, record, nowMs),
  );
  posture.attestations_valid = validAttestations.length > 0;
  if (posture.attestations_valid) {
    posture.state = 'ATTESTED';
  }

  const quorumCheck = validateQuorumIndependence(input.witnesses, [], nowMs);
  const callerQuorumFlag = job.quorum_satisfied === true;
  posture.quorum_satisfied = quorumCheck.ok === true && callerQuorumFlag;
  if (!quorumCheck.ok) {
    posture.quorum_status =
      quorumCheck.code === 'insufficient_independence' ||
      quorumCheck.code === 'ineligible_witness' ||
      quorumCheck.code === 'unknown_witness'
        ? 'insufficient_evidentiary_independence'
        : quorumCheck.code;
    posture.quorum_satisfied = false;
  }
  if (posture.quorum_satisfied) {
    posture.state = 'QUORUM_REACHED';
  }

  const chainCompleteThroughQuorum =
    posture.badge_valid &&
    posture.capability_valid &&
    posture.attestations_valid &&
    posture.quorum_satisfied;

  if (chainCompleteThroughQuorum && job.human_approval) {
    posture.human_approval = true;
    posture.state = 'HUMAN_APPROVED';
  }

  const executionPrerequisitesMet =
    chainCompleteThroughQuorum &&
    posture.human_approval &&
    job.execution_authorized === true;

  if (executionPrerequisitesMet) {
    posture.state = 'EXECUTION_AUTHORIZED';
    posture.execution_authorized = true;
  } else {
    posture.execution_authorized = false;
  }

  if (input.requestedState) {
    const requestedIndex = AUTHORIZATION_STATE_ORDER.indexOf(input.requestedState);
    const actualIndex = AUTHORIZATION_STATE_ORDER.indexOf(posture.state);
    if (requestedIndex > actualIndex + 1) {
      posture.state = 'EXPIRED_OR_REVOKED';
      posture.execution_authorized = false;
      posture.quorum_status = posture.quorum_status ?? 'state_skipped';
    }
  }

  return posture;
}

export function validateExecutionGrantMatchesPacket(input: {
  evidenceHash: string;
  action: string;
  scope: string[];
  approvalHash: string;
  approvalAction: string;
  approvalScope: string[];
}): ValidationResult {
  if (input.evidenceHash !== input.approvalHash) {
    return fail('approval_hash_mismatch', 'Human approval bound to a different evidence hash');
  }
  if (input.action !== input.approvalAction) {
    return fail('approval_action_mismatch', 'Human approval bound to a different action');
  }
  if (input.scope.join('|') !== input.approvalScope.join('|')) {
    return fail('approval_scope_mismatch', 'Human approval bound to a different scope');
  }
  return ok();
}

export function terminalIsRendererNotAuthority(source: AuthorizationPosture['authority_source']): boolean {
  return source === 'terminal_renderer';
}
