type Candidate = {
  external_source_system?: string;
  confidence_tier: number;
  status: 'pending';
};

type ReliabilityRecord = {
  source_system: string;
  reliability_score: number;
  previous_reliability_score?: number;
  verified_hits: number;
  verified_misses: number;
};

type AdapterHealth = {
  source_system: string;
  status: 'healthy' | 'degraded' | 'offline';
  last_ingest_at: string;
  last_success_at?: string;
  error_rate?: number;
};

export function buildAureaOversightReport(input: {
  adapterHealth: AdapterHealth[];
  candidates: Candidate[];
  reliability: ReliabilityRecord[];
}) {
  const countsBySource = input.candidates.reduce<Record<string, number>>((accumulator, item) => {
    const key = item.external_source_system || 'unknown';
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});

  const lowReliabilitySources = input.reliability.filter(
    (record) => record.reliability_score < 0.45,
  );
  const reliabilityDrift = input.reliability
    .map((record) => ({
      source_system: record.source_system,
      current_score: record.reliability_score,
      previous_score: record.previous_reliability_score,
      drift:
        typeof record.previous_reliability_score === 'number'
          ? Number((record.reliability_score - record.previous_reliability_score).toFixed(2))
          : null,
    }))
    .filter((record) => record.drift !== null);

  const degradedAdapters = input.adapterHealth.filter(
    (adapter) => adapter.status !== 'healthy' || (adapter.error_rate ?? 0) > 0.2,
  );
  const pendingCount = input.candidates.length;
  const candidateVolume = pendingCount > 20 ? 'elevated' : pendingCount > 10 ? 'watch' : 'nominal';

  return {
    overseer: 'AUREA',
    timestamp: new Date().toISOString(),
    adapter_health: {
      total: input.adapterHealth.length,
      degraded: degradedAdapters.length,
      statuses: input.adapterHealth,
    },
    candidate_volume: {
      pending_count: pendingCount,
      status: candidateVolume,
      counts_by_source: countsBySource,
    },
    source_reliability_drift: reliabilityDrift,
    low_reliability_sources: lowReliabilitySources,
    pending_epicon_backlog: {
      count: pendingCount,
      status: pendingCount > 20 ? 'elevated' : 'nominal',
    },
    summary:
      pendingCount > 20
        ? 'Pending external signal backlog elevated. Recommend ZEUS prioritization.'
        : degradedAdapters.length > 0
          ? 'Adapter health requires review before trust pressure increases.'
          : 'External signal intake nominal.',
    actions: [
      'Review adapter health for degraded or offline systems',
      'Review low-reliability sources',
      'Escalate repeated high-similarity candidates to HERMES clustering',
      'Monitor pending backlog growth',
    ],
  };
}
