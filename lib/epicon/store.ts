export type ExternalCandidate = {
  id: string;
  title: string;
  summary: string;
  category: string;
  status: 'pending' | 'verified' | 'contradicted';
  confidence_tier: number;
  external_source_system?: string;
  external_source_actor?: string;
  created_at: string;
  resolved_at?: string;
  zeus_note?: string;
  sources?: string[];
  tags?: string[];
  trace: string[];
  promoted_epicon_id?: string;
  promoted_ledger_entry_id?: string;
  promotion_state?: 'pending' | 'promoted' | 'not_promoted';
};

const store: ExternalCandidate[] = [];

export function addCandidates(
  newItems: Omit<ExternalCandidate, 'id' | 'created_at' | 'status'>[],
) {
  for (const item of newItems) {
    store.unshift({
      ...item,
      id: `${item.external_source_system || 'ext'}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      created_at: new Date().toISOString(),
      status: 'pending',
      trace: item.trace ?? [
        `External candidate ingested from ${item.external_source_system || 'unknown-source'}`,
      ],
      promotion_state: 'pending',
    });
  }

  if (store.length > 100) {
    store.length = 100;
  }
}

export function getCandidates() {
  return store;
}

export function getCandidate(id: string) {
  return store.find((x) => x.id === id) ?? null;
}

export function verifyCandidate(input: {
  id: string;
  outcome: 'verified' | 'contradicted';
  confidence_tier: number;
  zeus_note?: string;
  promoted_epicon_id?: string;
  promoted_ledger_entry_id?: string;
}) {
  const candidate = store.find((x) => x.id === input.id);
  if (!candidate) return null;

  candidate.status = input.outcome;
  candidate.confidence_tier = input.confidence_tier;
  candidate.zeus_note = input.zeus_note;
  candidate.resolved_at = new Date().toISOString();
  candidate.promoted_epicon_id = input.promoted_epicon_id;
  candidate.promoted_ledger_entry_id = input.promoted_ledger_entry_id;
  candidate.promotion_state = input.outcome === 'verified' ? 'promoted' : 'not_promoted';
  candidate.trace = [
    ...candidate.trace,
    `ZEUS review resolved candidate as ${input.outcome.toUpperCase()} at T${input.confidence_tier}`,
    ...(input.zeus_note ? [`ZEUS note: ${input.zeus_note}`] : []),
    ...(input.promoted_epicon_id
      ? [
          `Promoted into EPICON path as ${input.promoted_epicon_id}`,
          ...(input.promoted_ledger_entry_id
            ? [`Ledger commit recorded as ${input.promoted_ledger_entry_id}`]
            : []),
        ]
      : ['Candidate retained outside factual EPICON/ledger path']),
  ];

  return candidate;
}
