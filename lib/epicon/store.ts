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
  zeus_note?: string;
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
    });
  }

  if (store.length > 100) {
    store.length = 100;
  }
}

export function getCandidates() {
  return store;
}

export function verifyCandidate(input: {
  id: string;
  outcome: 'verified' | 'contradicted';
  confidence_tier: number;
  zeus_note?: string;
}) {
  const candidate = store.find((x) => x.id === input.id);
  if (!candidate) return null;

  candidate.status = input.outcome;
  candidate.confidence_tier = input.confidence_tier;
  candidate.zeus_note = input.zeus_note;

  return candidate;
}
