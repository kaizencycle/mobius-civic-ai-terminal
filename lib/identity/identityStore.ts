import { kvGet, kvSet } from '@/lib/kv/store';

const OPERATOR_USERNAME = 'kaizencycle';
const IDENTITY_KEY = `identity:${OPERATOR_USERNAME}`;
const MIC_KEY = `mic:${OPERATOR_USERNAME}`;

export interface MobiusIdentity {
  mobius_id: string;
  ledger_id: string;
  username: string;
  display_name: string;
  role: 'developer' | 'operator' | 'observer';
  status: 'active' | 'suspended';
  mii_score: number;
  mic_balance: number;
  epicon_count: number;
  agent_permissions: string[];
  joined_at: string;
  last_active_at: string;
}

export interface MICAccount {
  login: string;
  balance: number;
  locked: number;
  rewards_earned: number;
  mic_burned: number;
  updated_at: string;
}

function sanitizeBase64(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function deterministicId(prefix: 'mbx' | 'ldr', seed: string): string {
  const encoded = Buffer.from(seed).toString('base64');
  const stable = sanitizeBase64(encoded).slice(0, 8).padEnd(8, '0');
  return `${prefix}_${stable}`;
}

function createDefaultMICAccount(now: string): MICAccount {
  return {
    login: OPERATOR_USERNAME,
    balance: 100,
    locked: 0,
    rewards_earned: 0,
    mic_burned: 0,
    updated_at: now,
  };
}

function createDefaultIdentity(now: string, micBalance: number): MobiusIdentity {
  return {
    mobius_id: deterministicId('mbx', OPERATOR_USERNAME),
    ledger_id: deterministicId('ldr', `${OPERATOR_USERNAME}:ledger`),
    username: OPERATOR_USERNAME,
    display_name: 'Michael',
    role: 'developer',
    status: 'active',
    mii_score: 0.5,
    mic_balance: micBalance,
    epicon_count: 0,
    agent_permissions: ['ECHO', 'ZEUS', 'ATLAS', 'AUREA'],
    joined_at: now,
    last_active_at: now,
  };
}

export async function getMICAccount(): Promise<MICAccount> {
  const existing = await kvGet<MICAccount>(MIC_KEY);
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const created = createDefaultMICAccount(now);
  await kvSet(MIC_KEY, created);
  return created;
}

export async function updateMICBalance(delta: number): Promise<MICAccount> {
  const current = await getMICAccount();
  const updated: MICAccount = {
    ...current,
    balance: Math.max(0, current.balance + delta),
    updated_at: new Date().toISOString(),
  };

  await kvSet(MIC_KEY, updated);
  return updated;
}

export async function getOrCreateIdentity(): Promise<MobiusIdentity> {
  const micAccount = await getMICAccount();
  const now = new Date().toISOString();
  const existing = await kvGet<MobiusIdentity>(IDENTITY_KEY);

  if (existing) {
    const updated: MobiusIdentity = {
      ...existing,
      mic_balance: micAccount.balance,
      last_active_at: now,
    };
    await kvSet(IDENTITY_KEY, updated);
    return updated;
  }

  const created = createDefaultIdentity(now, micAccount.balance);
  await kvSet(IDENTITY_KEY, created);
  return created;
}

export async function syncIdentityRecord(username?: string): Promise<{ identity: MobiusIdentity; mic: MICAccount }> {
  if (username && username !== OPERATOR_USERNAME) {
    throw new Error('Unsupported username');
  }

  const [identity, mic] = await Promise.all([getOrCreateIdentity(), getMICAccount()]);
  return { identity, mic };
}
