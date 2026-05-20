/** Persisted journal JSON under Mobius-Substrate `journals/{agent}/`. */
export interface SubstrateJournalEntry {
  id: string;
  agent: string;
  agentOrigin: string;
  cycle: string;
  scope: string;
  category: string;
  severity: string;
  observation: string;
  inference: string;
  recommendation: string;
  confidence: number;
  derivedFrom: string[];
  source: string;
  tags: string[];
  gi_at_time?: number;
  timestamp: string;
  /** Terminal journal lane status when bridged from the app. */
  status?: string;
}

/** Input for the canon outbox queue (write fields; server assigns `id` and `timestamp`). */
export type SubstrateJournalWriteInput = Omit<SubstrateJournalEntry, 'id' | 'timestamp'> & {
  id?: string;
};
