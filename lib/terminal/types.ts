export type AgentStatus =
  | 'idle'
  | 'listening'
  | 'verifying'
  | 'routing'
  | 'analyzing'
  | 'alert';

export type Agent = {
  id: string;
  name: string;
  role: string;
  color: string;
  status: AgentStatus;
  heartbeatOk: boolean;
  lastAction: string;
};

export type EpiconStatus = 'verified' | 'pending' | 'contradicted';

export type EpiconItem = {
  id: string;
  title: string;
  category: 'geopolitical' | 'market' | 'governance' | 'infrastructure';
  status: EpiconStatus;
  confidenceTier: 0 | 1 | 2 | 3 | 4;
  ownerAgent: string;
  sources: string[];
  timestamp: string;
  summary: string;
  trace: string[];
};

export type Tripwire = {
  id: string;
  label: string;
  severity: 'low' | 'medium' | 'high';
  owner: string;
  openedAt: string;
  action: string;
};

export type GISnapshot = {
  score: number;
  delta: number;
  institutionalTrust: number;
  infoReliability: number;
  consensusStability: number;
  weekly: number[];
};

export type NavKey =
  | 'pulse'
  | 'agents'
  | 'ledger'
  | 'markets'
  | 'geopolitics'
  | 'governance'
  | 'reflections'
  | 'infrastructure'
  | 'search'
  | 'settings';

export type CommandResult = {
  ok: boolean;
  message: string;
};

// ── Mobius-Substrate types ────────────────────────────────────

export type LedgerEntry = {
  id: string;
  cycleId: string;
  type: 'epicon' | 'attestation' | 'shard' | 'ubi' | 'settlement';
  agentOrigin: string;
  timestamp: string;
  summary: string;
  integrityDelta: number;
  status: 'committed' | 'pending' | 'reverted';
};

export type MFSShard = {
  id: string;
  citizenId: string;
  archetype: 'learning' | 'verification' | 'governance' | 'creation' | 'reflection' | 'protection' | 'connection';
  weight: number;
  qualityScore: number;
  integrityCoefficient: number;
  miiDelta: number;
  timestamp: string;
};

export type Attestation = {
  id: string;
  citizenId: string;
  type: 'mint' | 'burn';
  reason: string;
  miiImpact: number;
  validatorAgent: string;
  timestamp: string;
};

export type Sentinel = {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'standby' | 'consensus' | 'veto';
  integrity: number;
  provider: string;
  lastAction: string;
  domains: string[];
};

// ── Browser Shell types ──────────────────────────────────────

export type CivicAlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type CivicRadarAlert = {
  id: string;
  title: string;
  severity: CivicAlertSeverity;
  category: 'misinformation' | 'privacy' | 'manipulation' | 'infrastructure' | 'governance';
  source: string;
  timestamp: string;
  impact: string;
  actions: string[];
};

export type InspectorTarget =
  | { kind: 'epicon'; data: EpiconItem }
  | { kind: 'agent'; data: Agent }
  | { kind: 'tripwire'; data: Tripwire }
  | { kind: 'gi'; data: GISnapshot }
  | { kind: 'ledger'; data: LedgerEntry }
  | { kind: 'shard'; data: MFSShard }
  | { kind: 'alert'; data: CivicRadarAlert }
  | { kind: 'sentinel'; data: Sentinel };
