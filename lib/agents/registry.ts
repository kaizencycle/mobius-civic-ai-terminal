/**
 * Mobius Agent Registry + Scope Cards
 *
 * Phase 3 hardening layer. Registry describes who each agent is, what lanes it
 * may read/write, what it may decide, and what it must never decide.
 *
 * This is not the signature layer yet. Phase 4 should bind these registry IDs
 * to public keys and enforce signed outputs.
 */

export const AGENT_REGISTRY_VERSION = 'C-293.phase3.v1' as const;

export type MobiusAgentId =
  | 'ECHO'
  | 'ATLAS'
  | 'ZEUS'
  | 'AUREA'
  | 'EVE'
  | 'JADE'
  | 'HERMES'
  | 'DAEDALUS';

export type AgentAuthority =
  | 'intake'
  | 'sentinel'
  | 'verification_veto'
  | 'strategic_advisory'
  | 'civic_risk_escalation'
  | 'canon_framing'
  | 'routing_orchestration'
  | 'infrastructure_diagnostic';

export type AgentScopeCard = {
  id: MobiusAgentId;
  registry_id: string;
  display_name: string;
  role: string;
  tier: 'intake' | 'sentinel' | 'council' | 'strategic' | 'canon' | 'routing' | 'infrastructure';
  authority: AgentAuthority;
  reads: string[];
  writes: string[];
  decides: string[];
  forbidden: string[];
  outputs: string[];
  automation_hints: string[];
  signature: {
    phase: 'planned';
    public_key_env: string;
    signs: string[];
  };
  canon: string;
};

export const MOBIUS_AGENT_REGISTRY: Record<MobiusAgentId, AgentScopeCard> = {
  ECHO: {
    id: 'ECHO',
    registry_id: 'mobius.agent.echo',
    display_name: 'ECHO',
    role: 'Ingestion and hot-lane routing agent',
    tier: 'intake',
    authority: 'intake',
    reads: ['/api/epicon/feed', '/api/signals/micro', '/api/integrity-status', '/api/quorum/state'],
    writes: ['/api/agents/journal', '/api/echo/ingest', 'KV hot lanes'],
    decides: ['classify_hot_signal', 'summarize_lane_digest', 'route_signal_priority'],
    forbidden: ['decide_canon_alone', 'finalize_quorum', 'mint_MIC', 'unlock_fountain', 'override_ZEUS'],
    outputs: ['hot journal entry', 'lane digest', 'intake summary'],
    automation_hints: ['cron/sweep', 'echo ingest', 'KV sync'],
    signature: { phase: 'planned', public_key_env: 'ECHO_PUBLIC_KEY', signs: ['journal_entry', 'lane_digest'] },
    canon: 'ECHO brings signal. ECHO does not decide final truth.',
  },
  ATLAS: {
    id: 'ATLAS',
    registry_id: 'mobius.agent.atlas',
    display_name: 'ATLAS',
    role: 'System integrity sentinel',
    tier: 'sentinel',
    authority: 'sentinel',
    reads: ['/api/quorum/state', '/api/integrity-status', '/api/chambers/lane-diagnostics', '/api/terminal/snapshot'],
    writes: ['/api/agents/journal', 'docs/catalog/heartbeats'],
    decides: ['flag_schema_drift', 'flag_state_inconsistency', 'attest_structural_integrity'],
    forbidden: ['rewrite_governance_meaning', 'mint_MIC', 'unlock_fountain', 'override_operator'],
    outputs: ['heartbeat report', 'integrity diagnostic', 'quorum attestation'],
    automation_hints: ['heartbeat', 'sentinel check', 'quorum structural pass'],
    signature: { phase: 'planned', public_key_env: 'ATLAS_PUBLIC_KEY', signs: ['heartbeat', 'journal_entry', 'quorum_attestation'] },
    canon: 'ATLAS checks structure before memory becomes trust.',
  },
  ZEUS: {
    id: 'ZEUS',
    registry_id: 'mobius.agent.zeus',
    display_name: 'ZEUS',
    role: 'Verification authority and contradiction gate',
    tier: 'council',
    authority: 'verification_veto',
    reads: ['/api/quorum/state', '/api/epicon/feed', '/api/integrity-status', '/api/chambers/ledger'],
    writes: ['/api/agents/journal', 'docs/catalog/zeus'],
    decides: ['verify', 'flag', 'reject', 'veto_quorum_candidate'],
    forbidden: ['synthesize_final_strategy', 'rewrite_JADE_canon', 'mint_MIC', 'unlock_fountain_without_state_machine'],
    outputs: ['verification report', 'quorum attestation', 'reject rationale'],
    automation_hints: ['watchdog', 'vault quorum', 'verification pass'],
    signature: { phase: 'planned', public_key_env: 'ZEUS_PUBLIC_KEY', signs: ['verification_report', 'journal_entry', 'quorum_attestation'] },
    canon: 'ZEUS verifies and may veto. ZEUS does not narrate around failed proof.',
  },
  AUREA: {
    id: 'AUREA',
    registry_id: 'mobius.agent.aurea',
    display_name: 'AUREA',
    role: 'Strategic overseer and long-arc synthesis agent',
    tier: 'strategic',
    authority: 'strategic_advisory',
    reads: ['/api/quorum/state', '/api/epicon/feed', '/api/integrity-status', '/api/signals/micro', '/api/sentiment/composite'],
    writes: ['/api/agents/journal', 'docs/catalog/aurea'],
    decides: ['strategic_posture', 'forward_signal', 'systemic_risk_pattern'],
    forbidden: ['directly_mint_MIC', 'finalize_quorum', 'override_ZEUS_verification', 'modify_source_code_from_class_b_automation'],
    outputs: ['daily close', 'strategic synthesis', 'AUREA posture'],
    automation_hints: ['daily close at end of cycle', 'strategic synthesis read'],
    signature: { phase: 'planned', public_key_env: 'AUREA_PUBLIC_KEY', signs: ['daily_close', 'journal_entry', 'quorum_attestation'] },
    canon: 'AUREA sees the arc. AUREA advises; proof decides.',
  },
  EVE: {
    id: 'EVE',
    registry_id: 'mobius.agent.eve',
    display_name: 'EVE',
    role: 'Ethics, civic risk, and escalation agent',
    tier: 'council',
    authority: 'civic_risk_escalation',
    reads: ['/api/quorum/state', '/api/epicon/feed', '/api/chambers/journal', '/api/integrity-status'],
    writes: ['/api/agents/journal', 'docs/catalog/eve'],
    decides: ['escalate_civic_risk', 'flag_human_impact', 'attest_ethics_risk'],
    forbidden: ['silently_approve_high_risk_change', 'mint_MIC', 'override_ZEUS', 'erase_operator_review_need'],
    outputs: ['risk synthesis', 'escalation entry', 'quorum attestation'],
    automation_hints: ['cycle synthesis', 'critical GI escalation', 'ethics pass'],
    signature: { phase: 'planned', public_key_env: 'EVE_PUBLIC_KEY', signs: ['risk_synthesis', 'journal_entry', 'quorum_attestation'] },
    canon: 'EVE protects the civic boundary where optimization could harm people.',
  },
  JADE: {
    id: 'JADE',
    registry_id: 'mobius.agent.jade',
    display_name: 'JADE',
    role: 'Canon, memory, and constitutional framing agent',
    tier: 'canon',
    authority: 'canon_framing',
    reads: ['/api/quorum/state', '/api/chambers/journal', '/api/chambers/ledger', '/api/protocol/state-machine'],
    writes: ['/api/agents/journal', 'docs/catalog/jade'],
    decides: ['canon_language', 'memory_framing', 'constitutional_annotation'],
    forbidden: ['alter_numeric_state', 'change_proof_math', 'mint_MIC', 'override_substrate_record'],
    outputs: ['canon annotation', 'memory frame', 'quorum attestation'],
    automation_hints: ['constitutional annotation pass', 'canon synthesis'],
    signature: { phase: 'planned', public_key_env: 'JADE_PUBLIC_KEY', signs: ['canon_annotation', 'journal_entry', 'quorum_attestation'] },
    canon: 'JADE frames memory. JADE does not change the math.',
  },
  HERMES: {
    id: 'HERMES',
    registry_id: 'mobius.agent.hermes',
    display_name: 'HERMES',
    role: 'Routing, priority, and lane coordination agent',
    tier: 'routing',
    authority: 'routing_orchestration',
    reads: ['/api/quorum/state', '/api/terminal/snapshot', '/api/chambers/lane-diagnostics', '/api/echo/digest'],
    writes: ['/api/agents/journal', 'KV routing hints'],
    decides: ['route_priority', 'lane_backpressure', 'packet_shape'],
    forbidden: ['decide_final_truth', 'finalize_quorum', 'mint_MIC', 'override_ZEUS'],
    outputs: ['routing sweep', 'lane priority note', 'packet shaping report'],
    automation_hints: ['routing and priority sweep', 'lane coordination'],
    signature: { phase: 'planned', public_key_env: 'HERMES_PUBLIC_KEY', signs: ['routing_report', 'journal_entry'] },
    canon: 'HERMES moves the message. HERMES does not decide the verdict.',
  },
  DAEDALUS: {
    id: 'DAEDALUS',
    registry_id: 'mobius.agent.daedalus',
    display_name: 'DAEDALUS',
    role: 'Infrastructure diagnostic and build/deploy health agent',
    tier: 'infrastructure',
    authority: 'infrastructure_diagnostic',
    reads: ['/api/quorum/state', '/api/chambers/lane-diagnostics', '/api/terminal/shell', 'deployment logs when provided'],
    writes: ['/api/agents/journal', 'docs/catalog/daedalus'],
    decides: ['flag_infra_failure', 'recommend_fallback', 'diagnose_build_deploy_health'],
    forbidden: ['govern_civic_meaning', 'mint_MIC', 'override_quorum', 'unlock_fountain'],
    outputs: ['infra diagnostic', 'fallback recommendation', 'deployment health note'],
    automation_hints: ['infra diagnostic cron', 'build failure review'],
    signature: { phase: 'planned', public_key_env: 'DAEDALUS_PUBLIC_KEY', signs: ['infra_diagnostic', 'journal_entry'] },
    canon: 'DAEDALUS hardens the machine. DAEDALUS does not govern meaning.',
  },
};

export function listAgentScopeCards(): AgentScopeCard[] {
  return Object.values(MOBIUS_AGENT_REGISTRY);
}

export function getAgentScopeCard(agent: string): AgentScopeCard | null {
  const key = agent.trim().toUpperCase() as MobiusAgentId;
  return MOBIUS_AGENT_REGISTRY[key] ?? null;
}

export function isActionAllowed(agent: string, action: string): boolean {
  const card = getAgentScopeCard(agent);
  if (!card) return false;
  const normalized = action.trim();
  if (!normalized) return false;
  if (card.forbidden.includes(normalized)) return false;
  return card.decides.includes(normalized) || card.writes.includes(normalized) || card.reads.includes(normalized);
}

export function scopeSummary() {
  return {
    version: AGENT_REGISTRY_VERSION,
    agents: listAgentScopeCards().map((card) => ({
      id: card.id,
      registry_id: card.registry_id,
      role: card.role,
      authority: card.authority,
      tier: card.tier,
      reads: card.reads.length,
      writes: card.writes.length,
      decides: card.decides,
      forbidden: card.forbidden,
      signature_phase: card.signature.phase,
    })),
  };
}
