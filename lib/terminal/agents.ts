/**
 * OPT-04 (C-323): Agent list with explicit MOCK_AGENTS fallback so the
 * Sentinel chamber never renders blank when the live API is cold or absent.
 */

import type { Agent } from './types';
import { mockAgents } from './mock';
import { fetchInternal, fetchExternal, isLiveAPI } from './api-client';
import { transformAgent } from './transforms';

export const MOCK_AGENTS: Agent[] = mockAgents;

export type AgentSource = 'live' | 'mock';

export type AgentsResult = {
  agents: Agent[];
  source: AgentSource;
};

export async function getAgentsWithSource(): Promise<AgentsResult> {
  const raw = await fetchInternal('/api/agents/status');
  if (raw && typeof raw === 'object') {
    const list = (raw as { agents?: unknown }).agents;
    if (Array.isArray(list) && list.length > 0) {
      const agents = list
        .map((a) => {
          if (!a || typeof a !== 'object') return null;
          const t = transformAgent(a);
          const s = (a as { status?: unknown }).status;
          const normalizedStatus =
            t.status === 'idle' || t.status === 'listening' || t.status === 'verifying' ||
            t.status === 'routing' || t.status === 'analyzing' || t.status === 'alert'
              ? t.status
              : s === 'active' ? 'listening' : 'idle';
          return { ...t, status: normalizedStatus } as Agent;
        })
        .filter((a): a is Agent => a !== null);
      if (agents.length > 0) return { agents, source: 'live' };
    }
  }

  if (isLiveAPI) {
    const ext = await fetchExternal('/agents/status');
    if (ext && typeof ext === 'object') {
      const list = (ext as { agents?: unknown }).agents;
      if (Array.isArray(list) && list.length > 0) {
        const agents = list
          .map((a) => {
            if (!a || typeof a !== 'object') return null;
            return transformAgent(a);
          })
          .filter((a): a is Agent => a !== null);
        if (agents.length > 0) return { agents, source: 'live' };
      }
    }
  }

  return { agents: MOCK_AGENTS, source: 'mock' };
}
