export type SubstrateServiceKey = 'ledger' | 'gi' | 'mic' | 'broker' | 'oaa';

// ... (UNCHANGED CONTENT ABOVE)

export interface SubstrateEntry {
  id?: string;
  timestamp?: string;
  agent: string;
  agentOrigin: string;
  cycle: string;
  title: string;
  summary: string;
  category:
    | 'market'
    | 'geopolitical'
    | 'infrastructure'
    | 'narrative'
    | 'governance'
    | 'ethics'
    | 'civic-risk'
    | 'observation'
    | 'inference'
    | 'alert'
    | 'recommendation'
    | 'close'
    | 'heartbeat'
    | 'verification'
    | 'ingest';
  severity: 'nominal' | 'elevated' | 'critical' | 'info' | 'degraded';
  source:
    | 'agent-journal'
    | 'eve-synthesis'
    | 'atlas-heartbeat'
    | 'zeus-verify'
    | 'aurea-close'
    | 'echo-ingest'
    | 'epicon-promotion'
    | 'seed-backfill';
  gi_at_time?: number;
  confidence?: number;
  derivedFrom?: string[];
  tags?: string[];
  verified?: boolean;

  // Phase 9: attestation proof layer (non-breaking optional field)
  attestation_signature?: unknown;
}

// ... (UNCHANGED CONTENT BELOW)

    const res = await fetch(`${LEDGER_BASE}/ledger/attest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: JSON.stringify({
        agent_id: entry.agentOrigin.toLowerCase(),
        event_type: entry.category,
        civic_id: `mobius-${entry.agentOrigin.toLowerCase()}`,
        lab_source: entry.source,
        payload: {
          event_id: eventId,
          title: entry.title,
          summary: entry.summary,
          cycle: entry.cycle,
          gi_at_time: entry.gi_at_time,
          mii: entry.confidence,
          severity: entry.severity,
          source: entry.source,
          tags: entry.tags ?? [],
          agent: entry.agent,
          agent_origin: entry.agentOrigin,
          derived_from: entry.derivedFrom ?? [],
          verified: entry.verified ?? false,

          // Phase 9: include signature if present
          attestation_signature: entry.attestation_signature ?? null,
        },
        timestamp: attestTimestamp,
      }),

// ... (rest unchanged)
