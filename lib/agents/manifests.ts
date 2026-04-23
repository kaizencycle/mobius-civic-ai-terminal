export type AgentName = 'ATLAS' | 'ZEUS' | 'EVE' | 'HERMES' | 'AUREA' | 'JADE' | 'DAEDALUS' | 'ECHO';

export type AgentManifest = {
  scope: string;
  watchList: string[];
  journalTone: string;
  triggerConditions: string[];
};

export const AGENT_ORDER: AgentName[] = ['ATLAS', 'ZEUS', 'EVE', 'HERMES', 'AUREA', 'JADE', 'DAEDALUS', 'ECHO'];

export const AGENT_MANIFESTS: Record<AgentName, AgentManifest> = {
  ATLAS: {
    scope: 'System integrity, operator accountability, sentinel oversight',
    watchList: [
      'GI composite',
      'heartbeat freshness',
      'EPICON commit chain',
      'operator action trail',
      'agent consensus divergence',
    ],
    journalTone: 'Measured, authoritative, constitutional',
    triggerConditions: ['GI drops', 'heartbeat gaps', 'unverified entries aging > 6h'],
  },
  ZEUS: {
    scope: 'Verification and contested claims',
    watchList: [
      'Unverified EPICON candidates',
      'source credibility',
      'cross-agent consensus',
      'tripwire threshold breaches',
    ],
    journalTone: 'Evidentiary, precise, skeptical by default',
    triggerConditions: [
      'Any entry pending verification > 2h',
      'ATLAS/EVE disagreement',
      'source conflict',
    ],
  },
  EVE: {
    scope: 'Governance, ethics, civic risk, narrative patterns',
    watchList: [
      'External events',
      'institutional behavior',
      'civic radar',
      'narrative overreach',
      'bias indicators',
      'power concentration',
    ],
    journalTone: 'Observational, cautionary, futures-oriented',
    triggerConditions: ['Civic alert threshold', 'GI drops', 'narrative cluster spikes'],
  },
  HERMES: {
    scope: 'Signal routing, message prioritization, information flow',
    watchList: [
      'Signal latency',
      'feed freshness',
      'agent communication gaps',
      'routing failures',
      'priority queue depth',
    ],
    journalTone: 'Technical, operational, terse',
    triggerConditions: ['Feed staleness > 30min', 'routing failures', 'queue depth'],
  },
  AUREA: {
    scope: 'Strategic synthesis, long arc patterns, system posture',
    watchList: [
      'Multi-cycle GI trends',
      'agent activity patterns',
      'EPICON entry density',
      'system maturity indicators',
    ],
    journalTone: 'Strategic, reflective, long-horizon',
    triggerConditions: ['Daily close', 'weekly arc', 'major threshold crossings'],
  },
  JADE: {
    scope: 'Constitutional annotation, memory framing, precedent',
    watchList: [
      'EPICON entries for constitutional relevance',
      'operator intent alignment',
      'covenant adherence',
    ],
    journalTone: 'Constitutional, archival, precise',
    triggerConditions: ['Entries touching Three Covenants', 'novel precedents'],
  },
  DAEDALUS: {
    scope: 'Infrastructure health, system build integrity',
    watchList: [
      'API health',
      'KV freshness',
      'deployment state',
      'dependency versions',
      'self-ping latency',
    ],
    journalTone: 'Engineering, diagnostic, factual',
    triggerConditions: ['401 errors', 'KV misses', 'build failures'],
  },
  ECHO: {
    scope: 'Event memory, deduplication, ingestion integrity',
    watchList: [
      'Feed dedup rate',
      'ingestion volume',
      'memory coherence',
      'duplicate events',
      'source overlap',
    ],
    journalTone: 'Archival, inventory-style, precise',
    triggerConditions: ['Dedup spikes', 'volume anomalies', 'memory gaps'],
  },
};
