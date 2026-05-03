export type EpiconAgentId = 'ATLAS' | 'ZEUS' | 'EVE' | 'AUREA' | 'JADE';

export type EpiconScope =
  | 'journal'
  | 'canon'
  | 'vault'
  | 'ledger'
  | 'merge'
  | 'governance'
  | 'runtime';

export type EpiconRiskLevel = 'low' | 'medium' | 'high';
export type EpiconStance = 'support' | 'oppose' | 'conditional';
export type EpiconStatus = 'pass' | 'needs_clarification' | 'fail';

export type EpiconIntent = {
  action: string;
  scope: EpiconScope[];
  risk_level: EpiconRiskLevel;
  intent_hash: string;
  summary: string;
  changed_files?: string[];
};

export type EpiconEJ = {
  reasoning: string;
  anchors: string[];
  counterfactuals: string[];
  ccr_score: number;
  css_pass: boolean;
};

export type EpiconAgentReport = {
  agent: EpiconAgentId;
  stance: EpiconStance;
  confidence: number;
  ej: EpiconEJ;
  ej_hash: string;
  generated_at: string;
};

export type EpiconConsensus = {
  status: EpiconStatus;
  ecs: number;
  vote: {
    support: number;
    conditional: number;
    oppose: number;
  };
  quorum: {
    agents: number;
    min_required: number;
    independent_ok: boolean;
  };
  dissent_set: Array<{
    agent: EpiconAgentId;
    stance: EpiconStance;
    reason: string;
  }>;
  required_questions: string[];
};

export type EpiconPacket = {
  version: 'EPICON-03';
  request_id: string;
  generated_at: string;
  intent: EpiconIntent;
  agent_reports: EpiconAgentReport[];
  consensus: EpiconConsensus;
  attestation: {
    packet_hash: string;
    sealed: boolean;
  };
};
