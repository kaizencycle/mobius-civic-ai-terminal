// C-410: Agent Badge and Stewardship Registry — fail-closed contract tests
// Run: tsx tests/contract/agentBadgeProtocol.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveAuthorizationPosture,
  detectSelfApproval,
  detectSelfVerification,
  getAgentBadge,
  listAgentBadges,
  STEWARDSHIP_REGISTRY,
  SURFACE_STEWARDSHIP,
  validateAgentBadge,
  validateBadgePermitsParticipation,
  validateExecutionGrantMatchesPacket,
  validateGovernedJob,
  validateJobCapability,
  validateQuorumIndependence,
} from '@/lib/agents/badge';
import type { AttestationRecord, GovernedJob, JobCapability, WitnessProvenance } from '@/lib/agents/badge';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EVIDENCE_HASH = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NOW = Date.parse('2026-08-21T12:00:00.000Z');

function baseJob(overrides: Partial<GovernedJob> = {}): GovernedJob {
  return {
    schema_version: '0.1',
    job_id: 'EPICON-C410-EXAMPLE',
    cycle: 'C-410',
    surface: 'terminal',
    domain: 'market_evidence',
    steward: 'mobius:agent:atlas',
    contributors: ['mobius:agent:hermes'],
    verifier: 'mobius:agent:zeus',
    guardian: 'mobius:agent:eve',
    human_approver: 'mobius:human:michael-judan',
    evidence_hash: EVIDENCE_HASH,
    quorum_satisfied: false,
    human_approval: false,
    execution_authorized: false,
    ...overrides,
  };
}

function baseCapability(overrides: Partial<JobCapability> = {}): JobCapability {
  return {
    schema_version: '0.1',
    capability_id: 'CAP-C410-EXAMPLE',
    cycle: 'C-410',
    agent_id: 'mobius:agent:zeus',
    job_id: 'EPICON-C410-EXAMPLE',
    evidence_hash: EVIDENCE_HASH,
    permitted_action: 'issue_attestation',
    scope: ['docs/epicon/cycles/C-410/'],
    issued_at: '2026-08-21T00:00:00.000Z',
    expires_at: '2026-12-31T23:59:59.000Z',
    revoked: false,
    execution_authority: false,
    ...overrides,
  };
}

describe('C-410 agent badge registry', () => {
  it('registers every stewardship agent with a distinct badge', () => {
    const badges = listAgentBadges();
    assert.equal(badges.length, 11);
    const ids = badges.map((badge) => badge.agent_id);
    assert.equal(new Set(ids).size, 11);
    for (const badge of badges) {
      assert.equal(badge.schema_version, '0.1');
      assert.equal(badge.execution_authority, false);
      assert.equal(badge.mic_mechanism, false);
      assert.equal(validateAgentBadge(badge, NOW).ok, true);
    }
  });

  it('encodes surface stewardship rows for initial assignments', () => {
    assert.ok(SURFACE_STEWARDSHIP.length >= 8);
    const terminal = SURFACE_STEWARDSHIP.find((row) => row.surface === 'terminal');
    assert.ok(terminal);
    assert.equal(terminal?.steward, 'mobius:agent:atlas');
    assert.equal(terminal?.verifier, 'mobius:agent:zeus');
  });

  it('public governance registry JSON mirrors stewardship canon', () => {
    const raw = readFileSync(join(repoRoot, 'governance/agents/registry.json'), 'utf8');
    const parsed = JSON.parse(raw) as { schema_version: string; badges: { agent_id: string }[] };
    assert.equal(parsed.schema_version, '0.1');
    assert.equal(parsed.badges.length, Object.keys(STEWARDSHIP_REGISTRY).length);
  });
});

describe('C-410 badge participation vs execution authority', () => {
  it('permits participation for eligible badge actions', () => {
    const result = validateBadgePermitsParticipation(
      'mobius:agent:zeus',
      'issue_attestation',
      NOW,
    );
    assert.equal(result.ok, true);
  });

  it('does not grant execution authority on any badge', () => {
    for (const badge of listAgentBadges()) {
      assert.equal(badge.execution_authority, false);
      if (badge.agent_id.startsWith('mobius:agent:')) {
        assert.equal(badge.permitted_actions.includes('authorize_execution'), false);
        assert.equal(badge.permitted_actions.includes('grant_human_consent'), false);
      }
    }
    const human = getAgentBadge('mobius:human:michael-judan');
    assert.ok(human);
    assert.equal(human?.execution_authority, false);
    assert.equal(human?.permitted_actions.includes('grant_human_consent'), true);
  });

  it('creates no MIC or financial balance fields', () => {
    for (const badge of listAgentBadges()) {
      assert.equal(badge.mic_mechanism, false);
      assert.equal('balance' in (badge as object), false);
      assert.equal('mic_amount' in (badge as object), false);
    }
  });
});

describe('C-410 division-of-labor and self-review rejection', () => {
  it('rejects ZEUS self-approving human consent', () => {
    const job = baseJob({ steward: 'mobius:agent:zeus' });
    const result = detectSelfApproval('mobius:agent:zeus', job, true);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.code, /self_approval/);
    }
  });

  it('rejects ATLAS verifying its own stewarded implementation', () => {
    const job = baseJob({ steward: 'mobius:agent:atlas', verifier: 'mobius:agent:atlas' });
    const result = detectSelfVerification(job, 'mobius:agent:atlas');
    assert.equal(result.ok, false);
  });

  it('rejects execution without human approval regardless of quorum flag', () => {
    const job = baseJob({
      quorum_satisfied: false,
      human_approval: false,
      execution_authorized: true,
    });
    const result = validateGovernedJob(job);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'missing_human_consent');
    }
  });

  it('rejects quorum bypassing human approval', () => {
    const job = baseJob({
      quorum_satisfied: true,
      human_approval: false,
      execution_authorized: true,
    });
    const result = validateGovernedJob(job);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'quorum_bypass');
    }
  });
});

describe('C-410 capability and packet binding', () => {
  it('invalidates capabilities bound to a different evidence hash', () => {
    const capability = baseCapability({
      evidence_hash: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });
    const result = validateJobCapability(capability, EVIDENCE_HASH, NOW);
    assert.equal(result.ok, false);
  });

  it('fails closed for revoked and expired capabilities', () => {
    const revoked = validateJobCapability(baseCapability({ revoked: true }), EVIDENCE_HASH, NOW);
    assert.equal(revoked.ok, false);

    const expired = validateJobCapability(
      baseCapability({ expires_at: '2026-01-01T00:00:00.000Z' }),
      EVIDENCE_HASH,
      NOW,
    );
    assert.equal(expired.ok, false);
  });

  it('rejects capabilities that widen standing beyond badge eligibility', () => {
    const capability = baseCapability({
      agent_id: 'mobius:agent:atlas',
      permitted_action: 'mutate_production',
    });
    const result = validateJobCapability(capability, EVIDENCE_HASH, NOW);
    assert.equal(result.ok, false);
  });

  it('rejects human approval for a different hash, action, or scope', () => {
    const mismatchHash = validateExecutionGrantMatchesPacket({
      evidenceHash: EVIDENCE_HASH,
      action: 'deploy',
      scope: ['app/api/'],
      approvalHash: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      approvalAction: 'deploy',
      approvalScope: ['app/api/'],
    });
    assert.equal(mismatchHash.ok, false);

    const mismatchScope = validateExecutionGrantMatchesPacket({
      evidenceHash: EVIDENCE_HASH,
      action: 'deploy',
      scope: ['app/api/'],
      approvalHash: EVIDENCE_HASH,
      approvalAction: 'deploy',
      approvalScope: ['lib/'],
    });
    assert.equal(mismatchScope.ok, false);
  });
});

describe('C-410 quorum independence and authorization posture', () => {
  it('does not satisfy quorum for duplicate witnesses', () => {
    const witnesses: WitnessProvenance[] = [
      { agent_id: 'mobius:agent:zeus', evidence_sources: ['docs/'] },
      { agent_id: 'mobius:agent:zeus', evidence_sources: ['docs/'] },
    ];
    const result = validateQuorumIndependence(witnesses);
    assert.equal(result.ok, false);
  });

  it('does not satisfy quorum when independence cannot be established', () => {
    const witnesses: WitnessProvenance[] = [
      { agent_id: 'mobius:agent:zeus' },
      { agent_id: 'mobius:agent:eve' },
    ];
    const result = validateQuorumIndependence(witnesses);
    assert.equal(result.ok, false);
  });

  it('does not satisfy quorum for unregistered witnesses', () => {
    const witnesses: WitnessProvenance[] = [
      {
        agent_id: 'mobius:agent:not-registered',
        evidence_sources: ['docs/'],
        model_provenance: 'review-runtime-a',
      },
      {
        agent_id: 'mobius:agent:eve',
        evidence_sources: ['docs/governance/'],
        model_provenance: 'review-runtime-b',
      },
    ];
    const result = validateQuorumIndependence(witnesses, [], NOW);
    assert.equal(result.ok, false);
  });

  it('does not satisfy quorum when witnesses share a process id', () => {
    const witnesses: WitnessProvenance[] = [
      {
        agent_id: 'mobius:agent:zeus',
        shared_process_id: 'process-a',
        evidence_sources: ['docs/epicon/'],
        model_provenance: 'review-runtime-a',
      },
      {
        agent_id: 'mobius:agent:eve',
        shared_process_id: 'process-a',
        evidence_sources: ['docs/governance/'],
        model_provenance: 'review-runtime-b',
      },
    ];
    const result = validateQuorumIndependence(witnesses, [], NOW);
    assert.equal(result.ok, false);
  });

  it('does not authorize execution from flags alone without validated chain', () => {
    const job = baseJob({
      quorum_satisfied: true,
      human_approval: true,
      execution_authorized: true,
    });
    const posture = deriveAuthorizationPosture({
      job,
      capabilities: [],
      attestations: [],
      witnesses: [],
      nowMs: NOW,
    });
    assert.equal(posture.execution_authorized, false);
    assert.notEqual(posture.state, 'EXECUTION_AUTHORIZED');
  });

  it('keeps execution_authorized false without human consent even when quorum is true', () => {
    const job = baseJob({ quorum_satisfied: true, human_approval: false, execution_authorized: false });
    const witnesses: WitnessProvenance[] = [
      {
        agent_id: 'mobius:agent:zeus',
        organizational_role: 'verifier',
        evidence_sources: ['docs/epicon/'],
        model_provenance: 'review-runtime-a',
      },
      {
        agent_id: 'mobius:agent:eve',
        organizational_role: 'guardian',
        evidence_sources: ['docs/governance/'],
        model_provenance: 'review-runtime-b',
      },
    ];
    const attestations: AttestationRecord[] = [
      {
        agent_id: 'mobius:agent:zeus',
        job_id: job.job_id,
        evidence_hash: job.evidence_hash,
        conclusion: 'adversarial pass with dispute preserved',
        attested_at: '2026-08-21T01:00:00.000Z',
      },
    ];
    const posture = deriveAuthorizationPosture({
      job,
      capabilities: [baseCapability()],
      attestations,
      witnesses,
      nowMs: NOW,
    });
    assert.equal(posture.quorum_satisfied, true);
    assert.equal(posture.human_approval, false);
    assert.equal(posture.execution_authorized, false);
    assert.equal(posture.state, 'QUORUM_REACHED');
  });

  it('marks terminal renderer posture as non-authoritative source', () => {
    const posture = deriveAuthorizationPosture({
      job: baseJob(),
      capabilities: [],
      attestations: [],
      witnesses: [],
      nowMs: NOW,
    });
    assert.equal(posture.authority_source, 'canon_registry');
    assert.equal(posture.mic_created, false);
  });
});

describe('C-410 badge fail-closed guards', () => {
  it('rejects unknown agent IDs', () => {
    const badge = getAgentBadge('mobius:agent:atlas');
    assert.ok(badge);
    const unknown = { ...badge!, agent_id: 'mobius:agent:unknown' };
    assert.equal(validateAgentBadge(unknown, NOW).ok, false);
  });

  it('rejects revoked and explicitly expired badges', () => {
    const badge = getAgentBadge('mobius:agent:zeus');
    assert.ok(badge);
    const revoked = { ...badge!, revocation_status: 'revoked' as const };
    assert.equal(validateAgentBadge(revoked, NOW).ok, false);

    const expired = { ...badge!, revocation_status: 'expired' as const, expires_at: null };
    assert.equal(validateAgentBadge(expired, NOW).ok, false);
  });

  it('rejects secrets in badge records', () => {
    const badge = getAgentBadge('mobius:agent:atlas');
    assert.ok(badge);
    const withSecret = { ...badge!, display_name: 'sk-1234567890abcdef' };
    assert.equal(validateAgentBadge(withSecret, NOW).ok, false);
  });
});
