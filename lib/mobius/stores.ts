/**
 * Mobius Profile + EPICON Stores
 *
 * In-memory stores shared across API routes.
 * V1: volatile (resets on cold start / redeploy).
 * V2: persist to database or git-backed ledger.
 *
 * MII Formula (V1):
 *   accuracy = hits / max(1, hits + misses)
 *   contribution_bonus = min(0.10, epicon_count * 0.005)
 *   MII = 0.30 + (accuracy * 0.60) + contribution_bonus
 *   clamped [0.0, 1.0]
 *
 * Tier thresholds:
 *   >= 0.90  signal-node
 *   >= 0.80  node-2
 *   >= 0.65  node-1
 *   >= 0.50  participant
 *   <  0.50  observer
 */

// ── Types ────────────────────────────────────────────────────

export type NodeTier = 'observer' | 'participant' | 'node-1' | 'node-2' | 'signal-node';

export type MIIHistoryPoint = {
  timestamp: string;
  score: number;
  reason: string;
};

export type MobiusProfile = {
  login: string;
  displayName: string;
  miiScore: number;
  nodeTier: NodeTier;
  epiconCount: number;
  verificationHits: number;
  verificationMisses: number;
  createdAt: string;
  lastActiveAt: string;
  miiHistory: MIIHistoryPoint[];
};

export type StoredEpicon = {
  id: string;
  title: string;
  summary: string;
  category: string;
  status: 'pending' | 'verified' | 'contradicted';
  confidenceTier: number;
  ownerAgent: string;
  sources: string[];
  tags: string[];
  timestamp: string;
  trace: string[];
  submittedBy?: string;
  submittedByLogin?: string;
  submittedByMii?: number;
  verificationOutcome?: 'hit' | 'miss' | null;
  zeusNote?: string | null;
  createdAt: string;
};

// ── Stores ───────────────────────────────────────────────────

const profileStore = new Map<string, MobiusProfile>();
const epiconStore = new Map<string, StoredEpicon>();

// Seed custodian profile
profileStore.set('kaizencycle', {
  login: 'kaizencycle',
  displayName: 'Michael Judan',
  miiScore: 0.64,
  nodeTier: 'node-1',
  epiconCount: 12,
  verificationHits: 9,
  verificationMisses: 1,
  createdAt: '2026-03-13T07:46:00Z',
  lastActiveAt: new Date().toISOString(),
  miiHistory: [
    { timestamp: '2026-03-13T07:46:00Z', score: 0.50, reason: 'Profile initialized — Mobius Terminal V1 launch' },
    { timestamp: '2026-03-14T10:00:00Z', score: 0.54, reason: 'First EPICON submissions recorded' },
    { timestamp: '2026-03-15T14:30:00Z', score: 0.58, reason: 'ZEUS verified 3 signals as hits' },
    { timestamp: '2026-03-16T09:15:00Z', score: 0.61, reason: 'Continued verified contributions' },
    { timestamp: '2026-03-17T10:06:00Z', score: 0.63, reason: 'C-253 Iran-Hormuz signal submissions' },
    { timestamp: '2026-03-17T15:00:00Z', score: 0.64, reason: 'Signal Engine V1 analysis verified' },
  ],
});

// ── MII Calculation ──────────────────────────────────────────

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

export function calculateMII(profile: MobiusProfile): number {
  const { verificationHits, verificationMisses, epiconCount } = profile;
  const accuracy = verificationHits / Math.max(1, verificationHits + verificationMisses);
  const contributionBonus = Math.min(0.10, epiconCount * 0.005);
  return Math.round(clamp(0.30 + accuracy * 0.60 + contributionBonus) * 100) / 100;
}

export function calculateTier(miiScore: number): NodeTier {
  if (miiScore >= 0.90) return 'signal-node';
  if (miiScore >= 0.80) return 'node-2';
  if (miiScore >= 0.65) return 'node-1';
  if (miiScore >= 0.50) return 'participant';
  return 'observer';
}

// ── Profile operations ───────────────────────────────────────

export function getProfile(login: string): MobiusProfile | null {
  return profileStore.get(login) ?? null;
}

export function ensureProfile(login: string, displayName: string): MobiusProfile {
  const existing = profileStore.get(login);
  if (existing) {
    existing.lastActiveAt = new Date().toISOString();
    return existing;
  }

  const now = new Date().toISOString();
  const profile: MobiusProfile = {
    login,
    displayName,
    miiScore: 0.50,
    nodeTier: 'participant',
    epiconCount: 0,
    verificationHits: 0,
    verificationMisses: 0,
    createdAt: now,
    lastActiveAt: now,
    miiHistory: [
      { timestamp: now, score: 0.50, reason: 'Profile initialized' },
    ],
  };
  profileStore.set(login, profile);
  return profile;
}

function appendHistory(profile: MobiusProfile, reason: string): void {
  profile.miiHistory.push({
    timestamp: new Date().toISOString(),
    score: profile.miiScore,
    reason,
  });
  // Keep last 30 entries
  if (profile.miiHistory.length > 30) {
    profile.miiHistory = profile.miiHistory.slice(-30);
  }
}

export function incrementEpiconCount(login: string): MobiusProfile | null {
  const profile = profileStore.get(login);
  if (!profile) return null;

  profile.epiconCount += 1;
  profile.lastActiveAt = new Date().toISOString();
  profile.miiScore = calculateMII(profile);
  profile.nodeTier = calculateTier(profile.miiScore);
  appendHistory(profile, `Submitted EPICON #${profile.epiconCount}`);
  return profile;
}

export function recordVerification(
  login: string,
  outcome: 'hit' | 'miss',
): MobiusProfile | null {
  const profile = profileStore.get(login);
  if (!profile) return null;

  if (outcome === 'hit') {
    profile.verificationHits += 1;
  } else {
    profile.verificationMisses += 1;
  }

  profile.lastActiveAt = new Date().toISOString();
  profile.miiScore = calculateMII(profile);
  profile.nodeTier = calculateTier(profile.miiScore);
  appendHistory(profile, `ZEUS verification: ${outcome}`);
  return profile;
}

// ── EPICON operations ────────────────────────────────────────

export function storeEpicon(epicon: StoredEpicon): void {
  epiconStore.set(epicon.id, epicon);
  if (epiconStore.size > 100) {
    const oldest = epiconStore.keys().next().value;
    if (oldest) epiconStore.delete(oldest);
  }
}

export function getStoredEpicon(id: string): StoredEpicon | null {
  return epiconStore.get(id) ?? null;
}

export function getAllSubmittedEpicons(): StoredEpicon[] {
  return Array.from(epiconStore.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function updateEpicon(
  id: string,
  updates: Partial<StoredEpicon>,
): StoredEpicon | null {
  const existing = epiconStore.get(id);
  if (!existing) return null;
  Object.assign(existing, updates);
  return existing;
}

export function getEpiconsByLogin(login: string): StoredEpicon[] {
  return Array.from(epiconStore.values())
    .filter((e) => e.submittedByLogin === login)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
