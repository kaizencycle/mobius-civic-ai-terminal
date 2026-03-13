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
