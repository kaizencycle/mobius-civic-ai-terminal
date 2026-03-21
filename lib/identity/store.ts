import { getMicAccount } from '@/lib/mic/store';
import type { MobiusIdentity, MobiusRole } from '@/lib/identity/types';

const DEFAULT_USERNAME = 'kaizencycle';
const DEFAULT_ROLE: MobiusRole = 'developer';
const DEFAULT_AGENTS = ['ECHO', 'ZEUS', 'ATLAS'];

const identities = new Map<string, MobiusIdentity>();

function randomId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeUsername(username?: string | null) {
  return (username || DEFAULT_USERNAME).trim() || DEFAULT_USERNAME;
}

function buildIdentity(username: string): MobiusIdentity {
  const now = new Date().toISOString();
  const account = getMicAccount(username);

  return {
    mobius_id: randomId('mbx'),
    ledger_id: randomId('ldr'),
    username,
    display_name: username === DEFAULT_USERNAME ? 'Michael' : username,
    role: DEFAULT_ROLE,
    status: 'active',
    mii_score: 0.5,
    mic_balance: account.balance,
    epicon_count: 0,
    agent_permissions: [...DEFAULT_AGENTS],
    joined_at: now,
    last_active_at: now,
  };
}

export function ensureIdentity(username?: string | null): MobiusIdentity {
  const normalized = normalizeUsername(username);
  const existing = identities.get(normalized);

  if (existing) {
    existing.mic_balance = getMicAccount(normalized).balance;
    return existing;
  }

  const created = buildIdentity(normalized);
  identities.set(normalized, created);
  return created;
}

export function getIdentity(username?: string | null) {
  return ensureIdentity(username);
}

export function listIdentities() {
  ensureIdentity(DEFAULT_USERNAME);

  return Array.from(identities.values()).map((identity) => ({
    ...identity,
    mic_balance: getMicAccount(identity.username).balance,
  }));
}

export function touchIdentity(username?: string | null) {
  const identity = ensureIdentity(username);
  identity.last_active_at = new Date().toISOString();
  identity.mic_balance = getMicAccount(identity.username).balance;
  return identity;
}

export function incrementEpiconCount(username?: string | null) {
  const identity = ensureIdentity(username);
  identity.epicon_count += 1;
  identity.last_active_at = new Date().toISOString();
  identity.mic_balance = getMicAccount(identity.username).balance;
  return identity;
}
