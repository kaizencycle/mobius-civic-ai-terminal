import { auth } from '@/auth';
import { kvGet, kvSet } from '@/lib/kv/store';

export interface OperatorSession {
  username: string;
  mobius_id: string;
  mii_score: number;
  mic_balance: number;
  tier: 'observer' | 'steward' | 'architect' | 'sentinel';
  permissions: string[];
}

type StoredIdentity = Omit<OperatorSession, 'permissions'> & { permissions?: string[] };

function deriveTier(score: number): OperatorSession['tier'] {
  if (score >= 0.9) return 'sentinel';
  if (score >= 0.8) return 'architect';
  if (score >= 0.65) return 'steward';
  return 'observer';
}

export async function getOperatorSession(): Promise<OperatorSession | null> {
  const session = await auth();
  const username = session?.user?.githubUsername;
  const mobiusId = session?.user?.mobius_id;
  if (!username || !mobiusId) return null;

  const key = `identity:${username}`;
  const existing = await kvGet<StoredIdentity>(key);

  if (existing) {
    const mii = typeof existing.mii_score === 'number' ? existing.mii_score : 0.72;
    return {
      username,
      mobius_id: mobiusId,
      mii_score: mii,
      mic_balance: typeof existing.mic_balance === 'number' ? existing.mic_balance : 100,
      tier: existing.tier ?? deriveTier(mii),
      permissions: existing.permissions ?? ['terminal:read', 'journal:post', 'epicon:publish'],
    };
  }

  const genesis: OperatorSession = {
    username,
    mobius_id: mobiusId,
    mii_score: 0.72,
    mic_balance: 100,
    tier: 'steward',
    permissions: ['terminal:read', 'journal:post', 'epicon:publish'],
  };
  await kvSet(key, genesis);
  return genesis;
}
