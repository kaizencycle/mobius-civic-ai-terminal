export type PublicEpiconRecord = {
  id: string;
  status: 'pending' | 'developing' | 'verified' | 'contradicted';
  title: string;
  summary: string;
  sources: string[];
  tags: string[];
  confidence_tier: number;
  publication_mode: 'public' | 'private_draft';
  mic_stake: number;
  agents_used: string[];
  submitted_by_login?: string;
  created_at: string;
  trace: string[];
};

const publicFeed: PublicEpiconRecord[] = [];

export function addPublicEpicon(record: PublicEpiconRecord) {
  publicFeed.unshift(record);

  if (publicFeed.length > 200) {
    publicFeed.length = 200;
  }

  return record;
}

export function getPublicEpiconFeed() {
  return publicFeed.slice();
}
