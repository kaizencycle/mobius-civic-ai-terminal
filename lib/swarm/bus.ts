// C-306 PR-512: Swarm message bus — persists agent results to KV so cross-agent
// activation checks (e.g. ZENITH reading ATLAS + ZEUS confidence) work across
// cron invocations without in-process state.

import { kvGetRaw, kvSetRawKey } from '@/lib/kv/store';

const BUS_PREFIX = 'swarm:bus:agent:';
const BUS_TTL_SEC = 3600; // results valid for 1h — covers multiple 10-min cron windows

export interface AgentBusEntry {
  agentId: string;
  cycle: string;
  ranAt: number;
  tier: number;
  result: unknown;          // parsed JSON from the LLM response
  confidence: number | null; // extracted from result if present, else null
  durationMs: number;
  error: string | null;
}

export type SwarmBusState = Record<string, AgentBusEntry>;

export async function readBusEntry(agentId: string): Promise<AgentBusEntry | null> {
  return kvGetRaw<AgentBusEntry>(`${BUS_PREFIX}${agentId}`);
}

export async function writeBusEntry(entry: AgentBusEntry): Promise<void> {
  await kvSetRawKey(`${BUS_PREFIX}${entry.agentId}`, entry, BUS_TTL_SEC);
}

export async function readAllBusEntries(agentIds: string[]): Promise<SwarmBusState> {
  const entries = await Promise.all(agentIds.map((id) => readBusEntry(id)));
  const state: SwarmBusState = {};
  for (let i = 0; i < agentIds.length; i++) {
    const entry = entries[i];
    if (entry) state[agentIds[i]] = entry;
  }
  return state;
}

export function extractConfidence(result: unknown): number | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;
  const c = r.confidence;
  if (typeof c === 'number' && Number.isFinite(c)) return Math.min(Math.max(c, 0), 1);
  return null;
}
