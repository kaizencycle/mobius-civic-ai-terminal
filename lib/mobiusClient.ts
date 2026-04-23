export interface Agent {
  id: string;
  name?: string;
  status?: string;
  confidence?: number;
  last_seen?: string;
  consensus_participation?: number;
  recent_epicons?: number;
  provider?: string;
}

export interface AgentDetail {
  profile: Record<string, unknown>;
  activity: Record<string, unknown>;
  contributions: Record<string, unknown>;
}

export interface EPICONEvent {
  id?: string;
  [key: string]: unknown;
}

export interface GlobalIntegrity {
  [key: string]: unknown;
}

export interface MICWallet {
  [key: string]: unknown;
}

export interface LabStatus {
  success: boolean;
  lab: string;
  status: 'healthy' | 'degraded' | 'offline';
  details?: Record<string, unknown>;
  error?: string;
}

export interface IntentRequest {
  agent_id: string;
  intent: string;
  spec: string;
  expected_outcome: string;
  divergence_tolerance?: number;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded';
  services: Record<string, string>;
  timestamp: string;
}

const GATEWAY_URL = process.env.NEXT_PUBLIC_MOBIUS_GATEWAY_URL;

export class MobiusGatewayClient {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = GATEWAY_URL || 'http://localhost:8000/api/v1';
  }

  async getAgents(): Promise<Agent[]> {
    const res = await fetch(`${this.baseUrl}/agents/status`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.data;
  }

  async getAgentDetail(agentId: string): Promise<AgentDetail> {
    const res = await fetch(`${this.baseUrl}/agents/${agentId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.data;
  }

  async getEPICONFeed(limit = 50, agent?: string): Promise<EPICONEvent[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (agent) params.set('agent', agent);

    const res = await fetch(`${this.baseUrl}/epicon/feed?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.data;
  }

  async getGI(): Promise<GlobalIntegrity> {
    const res = await fetch(`${this.baseUrl}/integrity/current`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.data;
  }

  async getWallet(userId: string): Promise<MICWallet> {
    const res = await fetch(`${this.baseUrl}/mic/wallet/${userId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.data;
  }

  async getLabStatus(labId: 'oaa' | 'reflections' | 'shield'): Promise<LabStatus> {
    const res = await fetch(`${this.baseUrl}/labs/${labId}/status`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async submitIntent(intent: IntentRequest): Promise<{ success: boolean }> {
    const res = await fetch(`${this.baseUrl}/intent/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(intent),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  connectEventStream(): EventSource {
    return new EventSource(`${this.baseUrl}/stream/events`);
  }

  async checkHealth(): Promise<HealthStatus> {
    const res = await fetch(`${this.baseUrl.replace('/api/v1', '')}/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
}
