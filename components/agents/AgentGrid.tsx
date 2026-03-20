'use client';

import { useEffect, useState } from 'react';
import AgentCard from './AgentCard';

type Agent = {
  id: string;
  name: string;
  role: string;
  tier: string;
  status: 'alive' | 'idle' | 'offline';
  color: string;
  detail: string;
};

type AgentStatusResponse = {
  ok: true;
  cycle: string;
  timestamp: string;
  agents: Agent[];
};

export default function AgentGrid() {
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/agents/status', { cache: 'no-store' });
      const json: AgentStatusResponse = await res.json();
      setAgents(json.agents || []);
    }

    load();
  }, []);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {agents.map((agent) => (
        <AgentCard key={agent.id} agent={agent} />
      ))}
    </div>
  );
}
