export type MobiusRole =
  | 'observer'
  | 'citizen'
  | 'analyst'
  | 'journalist'
  | 'developer'
  | 'steward';

export type MobiusIdentityStatus = 'active' | 'restricted' | 'suspended';

export type MobiusIdentity = {
  mobius_id: string;
  ledger_id: string;
  username: string;
  display_name: string;
  role: MobiusRole;
  status: MobiusIdentityStatus;
  mii_score: number;
  mic_balance: number;
  epicon_count: number;
  agent_permissions: string[];
  joined_at: string;
  last_active_at: string;
};
