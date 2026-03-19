export type ExternalSignalCategory =
  | 'market'
  | 'geopolitical'
  | 'governance'
  | 'infrastructure'
  | 'narrative';

export type EpiconCompatibleCategory =
  | 'market'
  | 'geopolitical'
  | 'governance'
  | 'infrastructure';

export type ExternalSignal = {
  external_id: string;
  source_system: string;
  source_actor?: string;
  observed_at: string;
  category: ExternalSignalCategory;
  title: string;
  summary: string;
  raw_payload: unknown;
  source_url?: string;
  tags?: string[];
};

export type NormalizedEpiconCandidate = {
  title: string;
  summary: string;
  category: EpiconCompatibleCategory;
  status: 'pending';
  confidence_tier: 0 | 1;
  owner_agent: 'ECHO';
  sources: string[];
  trace: string[];
  tags?: string[];
  external_source_system: string;
  external_source_actor?: string;
  external_source_reliability?: number;
};

export interface SourceAdapter {
  id: string;
  sourceSystem: string;
  ingest(input: unknown): Promise<ExternalSignal[]>;
  normalize(
    signal: ExternalSignal
  ): Promise<NormalizedEpiconCandidate | null>;
}
