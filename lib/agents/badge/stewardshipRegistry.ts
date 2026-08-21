/**
 * C-410 — Stewardship registry: canonical Agent Badge declarations.
 * Terminal renders this canon; it is not the durable authority source of truth.
 */

import {
  AGENT_PROHIBITED_ACTIONS,
  BADGE_ISSUED_AT,
  HUMAN_ISSUER,
  HUMAN_STEWARD,
} from '@/lib/agents/badge/constants';
import type { AgentBadge, SurfaceStewardshipRow } from '@/lib/agents/badge/types';

function agentBadge(
  agentSlug: string,
  displayName: string,
  badgeType: AgentBadge['badge_type'],
  primaryDomains: string[],
  coreFunction: string,
  permittedActions: string[],
  extraProhibited: string[] = [],
): AgentBadge {
  return {
    schema_version: '0.1',
    agent_id: `mobius:agent:${agentSlug}`,
    display_name: displayName,
    badge_type: badgeType,
    primary_domains: primaryDomains,
    core_function: coreFunction,
    permitted_actions: permittedActions,
    prohibited_actions: [...AGENT_PROHIBITED_ACTIONS, ...extraProhibited],
    issuer: HUMAN_ISSUER,
    issued_at: BADGE_ISSUED_AT,
    expires_at: null,
    revocation_status: 'active',
    public_key_id: null,
    human_steward: HUMAN_STEWARD,
    execution_authority: false,
    mic_mechanism: false,
  };
}

export const STEWARDSHIP_REGISTRY: Record<string, AgentBadge> = {
  'mobius:agent:atlas': agentBadge(
    'atlas',
    'ATLAS',
    'steward',
    ['terminal', 'substrate', 'cpc', 'architecture', 'implementation'],
    'Architecture and implementation',
    ['read_evidence', 'review_packet', 'coordinate_job', 'issue_attestation', 'propose_change'],
  ),
  'mobius:agent:zeus': agentBadge(
    'zeus',
    'ZEUS',
    'independent_verifier',
    ['governance_verification', 'adversarial_review', 'cross_surface_verification'],
    'Adversarial review and disputes',
    ['read_evidence', 'review_packet', 'issue_attestation', 'open_dispute', 'recommend_block'],
  ),
  'mobius:agent:hermes': agentBadge(
    'hermes',
    'HERMES',
    'market_analyst',
    ['markets', 'economic_evidence', 'market_provenance'],
    'Market analysis and provenance',
    ['read_evidence', 'review_packet', 'supply_market_evidence', 'issue_attestation'],
  ),
  'mobius:agent:jade': agentBadge(
    'jade',
    'JADE',
    'narrative_steward',
    ['chambers', 'academy', 'narrative_coherence'],
    'Teaching and narrative coherence',
    ['read_evidence', 'review_packet', 'frame_narrative', 'issue_attestation'],
  ),
  'mobius:agent:eve': agentBadge(
    'eve',
    'EVE',
    'civic_guardian',
    ['civic_governance', 'ethical_review', 'dignity'],
    'Dignity and constitutional review',
    ['read_evidence', 'review_packet', 'assess_civic_risk', 'issue_attestation', 'recommend_block'],
  ),
  'mobius:agent:echo': agentBadge(
    'echo',
    'ECHO',
    'signal_observer',
    ['live_world_observation', 'signals', 'anomalies', 'evidence_intake'],
    'Signals, anomalies and evidence intake',
    ['read_evidence', 'observe_signals', 'intake_evidence', 'issue_attestation'],
  ),
  'mobius:agent:aurea': agentBadge(
    'aurea',
    'AUREA',
    'strategic_synthesizer',
    ['canon', 'handbook', 'roadmap', 'strategic_coherence'],
    'Strategic and canon coherence',
    ['read_evidence', 'review_packet', 'synthesize_strategy', 'issue_attestation'],
  ),
  'mobius:agent:daedalus': agentBadge(
    'daedalus',
    'DAEDALUS',
    'research_architect',
    ['labs', 'handbook_research', 'structural_design'],
    'Research and structural design',
    ['read_evidence', 'review_packet', 'design_structure', 'issue_attestation'],
  ),
  'mobius:agent:zenith': agentBadge(
    'zenith',
    'ZENITH',
    'cross_system_reviewer',
    ['cross_system_comparison', 'independent_technical_review'],
    'Independent technical review',
    ['read_evidence', 'review_packet', 'cross_check_systems', 'issue_attestation'],
  ),
  'mobius:agent:uriel': agentBadge(
    'uriel',
    'URIEL',
    'contrarian_analyst',
    ['contrarian_analysis', 'external_challenge', 'dissent'],
    'External challenge and dissent',
    ['read_evidence', 'review_packet', 'challenge_claims', 'issue_attestation', 'open_dispute'],
  ),
  'mobius:human:michael-judan': {
    schema_version: '0.1',
    agent_id: 'mobius:human:michael-judan',
    display_name: 'Michael Judan',
    badge_type: 'human_authority',
    primary_domains: ['entire_civic_mesh', 'human_consent', 'final_authority'],
    core_function: 'Human consent and final authority',
    permitted_actions: [
      'read_evidence',
      'review_packet',
      'grant_human_consent',
      'authorize_execution',
      'revoke_capability',
    ],
    prohibited_actions: [
      'mint_mic',
      'delegate_human_consent_to_agent',
      'auto_approve_without_review',
    ],
    issuer: HUMAN_ISSUER,
    issued_at: BADGE_ISSUED_AT,
    expires_at: null,
    revocation_status: 'active',
    public_key_id: null,
    human_steward: HUMAN_STEWARD,
    execution_authority: false,
    mic_mechanism: false,
  },
};

export const SURFACE_STEWARDSHIP: SurfaceStewardshipRow[] = [
  {
    surface: 'terminal',
    steward: 'mobius:agent:atlas',
    contributors: ['mobius:agent:hermes', 'mobius:agent:echo'],
    verifier: 'mobius:agent:zeus',
    guardian: 'mobius:agent:eve',
  },
  {
    surface: 'substrate',
    steward: 'mobius:agent:aurea',
    contributors: ['mobius:agent:atlas', 'mobius:agent:daedalus'],
    verifier: 'mobius:agent:zeus',
    guardian: 'mobius:agent:eve',
  },
  {
    surface: 'chambers',
    steward: 'mobius:agent:jade',
    contributors: ['mobius:agent:echo', 'mobius:agent:daedalus'],
    verifier: 'mobius:agent:zeus',
    guardian: 'mobius:agent:eve',
  },
  {
    surface: 'handbook',
    steward: 'mobius:agent:aurea',
    contributors: ['mobius:agent:daedalus', 'mobius:agent:jade'],
    verifier: 'mobius:agent:zeus',
    guardian: 'mobius:agent:eve',
  },
  {
    surface: 'evidence_commons',
    steward: 'mobius:agent:echo',
    contributors: ['mobius:agent:hermes'],
    verifier: 'mobius:agent:zeus',
    guardian: 'mobius:agent:eve',
  },
  {
    surface: 'cpc',
    steward: 'mobius:agent:atlas',
    contributors: [],
    verifier: 'mobius:agent:zeus',
    guardian: 'mobius:agent:eve',
  },
  {
    surface: 'hive',
    steward: 'mobius:agent:atlas',
    contributors: ['mobius:agent:echo'],
    verifier: 'mobius:agent:zeus',
    guardian: 'mobius:agent:eve',
  },
  {
    surface: 'labs',
    steward: 'mobius:agent:daedalus',
    contributors: [],
    verifier: 'mobius:agent:zenith',
    guardian: 'mobius:agent:eve',
  },
  {
    surface: 'roadmap',
    steward: 'mobius:agent:aurea',
    contributors: [],
    verifier: 'mobius:agent:zeus',
    guardian: 'mobius:human:michael-judan',
  },
];

export function listAgentBadges(): AgentBadge[] {
  return Object.values(STEWARDSHIP_REGISTRY);
}

export function getAgentBadge(agentId: string): AgentBadge | null {
  return STEWARDSHIP_REGISTRY[agentId] ?? null;
}

export function getSurfaceStewardship(surface: string): SurfaceStewardshipRow | null {
  const key = surface.trim().toLowerCase();
  return SURFACE_STEWARDSHIP.find((row) => row.surface === key) ?? null;
}
