const AGENTS = [
  { id: 'atlas', name: 'ATLAS', role: 'Strategic Reasoning', tier: 'Sentinel', color: 'cerulean' },
  { id: 'zeus', name: 'ZEUS', role: 'Verification Authority', tier: 'Sentinel', color: 'gold' },
  { id: 'hermes', name: 'HERMES', role: 'Routing and Prioritization', tier: 'Steward', color: 'coral' },
  { id: 'aurea', name: 'AUREA', role: 'Oversight and Synthesis', tier: 'Architect', color: 'amber' },
  { id: 'jade', name: 'JADE', role: 'Annotation and Memory Framing', tier: 'Architect', color: 'jade' },
  { id: 'daedalus', name: 'DAEDALUS', role: 'Systems Builder', tier: 'Architect', color: 'bronze' },
  { id: 'echo', name: 'ECHO', role: 'Event Ingestion', tier: 'Steward', color: 'silver' },
  { id: 'eve', name: 'EVE', role: 'Observer / Watchtower', tier: 'Observer', color: 'rose' },
] as const;

export function mockAgentStatus() {
  const timestamp = new Date().toISOString();
  return {
    ok: true,
    cycle: 'unknown',
    timestamp,
    source: 'mock' as const,
    agents: AGENTS.map((agent) => ({
      ...agent,
      status: 'offline' as const,
      detail: 'Representative placeholder while live agent heartbeat is unavailable.',
      heartbeat_ok: false,
      last_action: 'Live source unavailable',
    })),
  };
}

export function mockIntegrityStatus() {
  return {
    ok: true,
    global_integrity: 0.5,
    mode: 'unknown',
    terminal_status: 'disconnected',
    source: 'mock' as const,
    primary_driver: 'Live data unavailable',
  };
}

export function mockSignals() {
  const timestamp = new Date().toISOString();
  return [
    {
      id: 'mock-signal-awaiting-feed',
      source: 'mock' as const,
      category: 'infrastructure' as const,
      severity: 'low' as const,
      title: 'Awaiting live signal feed',
      summary: 'Representative placeholder while upstream signal providers reconnect.',
      timestamp,
    },
    {
      id: 'mock-signal-source-offline',
      source: 'mock' as const,
      category: 'infrastructure' as const,
      severity: 'low' as const,
      title: 'Signal source offline',
      summary: 'Representative placeholder indicating a temporary telemetry outage.',
      timestamp,
    },
    {
      id: 'mock-signal-entry',
      source: 'mock' as const,
      category: 'infrastructure' as const,
      severity: 'low' as const,
      title: 'Mock entry',
      summary: 'Representative placeholder entry to keep the terminal surface populated.',
      timestamp,
    },
  ];
}

export function mockTripwire() {
  return {
    active: false,
    level: 'unknown',
    reason: 'Tripwire data unavailable — live source offline',
  };
}

export function mockEveNews() {
  const timestamp = new Date().toISOString();
  return [
    {
      id: 'eve-mock-live-feed-offline',
      title: 'Live news feed offline',
      summary: 'Representative placeholder while EVE reconnects to live geopolitical inputs.',
      url: '',
      source: 'mock' as const,
      region: 'Global',
      timestamp,
      category: 'geopolitical' as const,
      severity: 'low' as const,
      eve_tag: 'Mock fallback active',
    },
    {
      id: 'eve-mock-reconnecting',
      title: 'Reconnecting to EVE…',
      summary: 'Representative placeholder while live current-events polling resumes.',
      url: '',
      source: 'mock' as const,
      region: 'Global',
      timestamp,
      category: 'geopolitical' as const,
      severity: 'low' as const,
      eve_tag: 'Mock fallback active',
    },
    {
      id: 'eve-mock-awaiting-signal',
      title: 'Awaiting signal',
      summary: 'Representative placeholder until fresh EVE global news arrives.',
      url: '',
      source: 'mock' as const,
      region: 'Global',
      timestamp,
      category: 'geopolitical' as const,
      severity: 'low' as const,
      eve_tag: 'Mock fallback active',
    },
  ];
}

export function mockRuntimeStatus() {
  return {
    last_run: null,
    freshness: { status: 'unknown', seconds: null },
    source: 'mock' as const,
  };
}
