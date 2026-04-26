import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { getAgentScopeCard } from '@/lib/agents/registry';

export const AGENT_SIGNATURE_VERSION = 'C-293.phase4.v1' as const;

export type AgentSignedAction = {
  version: typeof AGENT_SIGNATURE_VERSION;
  agent: string;
  registry_id: string;
  cycle: string;
  action: string;
  payload_hash: string;
  dedupe_key: string;
  signed_at: string;
  signature: string;
};

export type SignatureVerification = {
  ok: boolean;
  reason: string;
  envelope?: Omit<AgentSignedAction, 'signature'>;
};

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

export function hashPayload(payload: unknown): string {
  return `sha256:${createHash('sha256').update(stableJson(payload)).digest('hex')}`;
}

export function buildDedupeKey(args: { agent: string; cycle: string; action: string; target: string }): string {
  return [args.agent.trim().toUpperCase(), args.cycle.trim(), args.action.trim(), args.target.trim()].join(':');
}

function signingBase(envelope: Omit<AgentSignedAction, 'signature'>): string {
  return stableJson(envelope);
}

function agentSecret(agent: string): string | null {
  const key = `${agent.trim().toUpperCase()}_SIGNING_SECRET`;
  const value = process.env[key]?.trim();
  return value || null;
}

function safeCompareHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export function signAgentAction(args: {
  agent: string;
  cycle: string;
  action: string;
  target: string;
  payload: unknown;
  signedAt?: string;
}): AgentSignedAction {
  const agent = args.agent.trim().toUpperCase();
  const card = getAgentScopeCard(agent);
  if (!card) throw new Error(`agent_not_registered:${agent}`);
  if (card.forbidden.includes(args.action)) throw new Error(`action_forbidden:${args.action}`);
  if (!card.decides.includes(args.action) && !card.signature.signs.includes(args.action)) {
    throw new Error(`action_out_of_scope:${args.action}`);
  }

  const secret = agentSecret(agent);
  if (!secret) throw new Error(`missing_agent_signing_secret:${agent}`);

  const envelope: Omit<AgentSignedAction, 'signature'> = {
    version: AGENT_SIGNATURE_VERSION,
    agent,
    registry_id: card.registry_id,
    cycle: args.cycle,
    action: args.action,
    payload_hash: hashPayload(args.payload),
    dedupe_key: buildDedupeKey({ agent, cycle: args.cycle, action: args.action, target: args.target }),
    signed_at: args.signedAt ?? new Date().toISOString(),
  };

  const signature = createHmac('sha256', secret).update(signingBase(envelope)).digest('hex');
  return { ...envelope, signature };
}

export function verifyAgentAction(args: {
  signed: AgentSignedAction;
  payload: unknown;
}): SignatureVerification {
  const agent = args.signed.agent.trim().toUpperCase();
  const card = getAgentScopeCard(agent);
  if (!card) return { ok: false, reason: 'agent_not_registered' };
  if (card.registry_id !== args.signed.registry_id) return { ok: false, reason: 'registry_id_mismatch' };
  if (card.forbidden.includes(args.signed.action)) return { ok: false, reason: 'action_forbidden' };
  if (!card.decides.includes(args.signed.action) && !card.signature.signs.includes(args.signed.action)) {
    return { ok: false, reason: 'action_out_of_scope' };
  }

  const expectedHash = hashPayload(args.payload);
  if (expectedHash !== args.signed.payload_hash) return { ok: false, reason: 'payload_hash_mismatch' };

  const secret = agentSecret(agent);
  if (!secret) return { ok: false, reason: 'missing_agent_signing_secret' };

  const { signature, ...envelope } = args.signed;
  const expected = createHmac('sha256', secret).update(signingBase(envelope)).digest('hex');
  if (!safeCompareHex(expected, signature)) return { ok: false, reason: 'signature_mismatch' };

  return { ok: true, reason: 'signature_verified', envelope };
}
