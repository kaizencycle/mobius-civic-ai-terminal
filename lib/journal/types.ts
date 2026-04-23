/**
 * Journal chamber display types (aligned with `/api/agents/journal` payload).
 * UI-only; API route owns the canonical write shape.
 */

export type JournalDisplayStatus = 'draft' | 'committed' | 'contested' | 'verified';
export type JournalDisplaySeverity = 'nominal' | 'elevated' | 'critical';

/** Fields the journal API returns; optional where legacy or derived entries may omit. */
export type JournalDisplayEntry = {
  id: string;
  agent: string;
  cycle?: string;
  category?: string;
  observation?: string;
  inference?: string;
  recommendation?: string;
  confidence?: number;
  derivedFrom?: string[];
  source?: string;
  timestamp?: string;
  status?: JournalDisplayStatus;
  severity?: JournalDisplaySeverity;
  scope?: string;
  agentOrigin?: string;
  source_mode?: 'kv' | 'substrate';
  canonical_path?: string;
};
