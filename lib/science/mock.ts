export type ScienceOverviewMetric = {
  label: string;
  value: string;
  note: string;
};

export type ScienceConsensusDomain = {
  domain: string;
  zeus: 'verified' | 'watch' | 'pending';
  jade: 'translated' | 'watch' | 'pending';
  aurea: 'framed' | 'watch' | 'pending';
  note: string;
};

export type ScienceRecord = {
  timestamp: string;
  title: string;
  source: string;
  confidence: 'high' | 'medium' | 'low';
  summary: string;
};

export type FrontierWatchItem = {
  title: string;
  lane: 'space' | 'earth' | 'climate' | 'biotech' | 'compute';
  status: 'watch' | 'active' | 'stable';
  summary: string;
};

export const scienceOverviewMetrics: ScienceOverviewMetric[] = [
  {
    label: 'Science signals',
    value: '12',
    note: 'Canonical records prepared for chamber indexing and EPICON routing.',
  },
  {
    label: 'Consensus domains',
    value: '5',
    note: 'Space, Earth, climate, biotech, and compute synthesis lanes visible.',
  },
  {
    label: 'Translation state',
    value: 'JADE online',
    note: 'Plain-language civic summaries sit beside technical interpretation.',
  },
  {
    label: 'Timestamp order',
    value: 'Canonical',
    note: 'Newest-first chamber display, preserved source timestamps, no narrative backfill drift.',
  },
];

export const scienceConsensusDomains: ScienceConsensusDomain[] = [
  {
    domain: 'Seismic + geophysical signals',
    zeus: 'verified',
    jade: 'translated',
    aurea: 'framed',
    note: 'Convert quake clusters and anomaly chatter into calm watch language.',
  },
  {
    domain: 'Solar + orbital watch',
    zeus: 'verified',
    jade: 'translated',
    aurea: 'framed',
    note: 'Keep solar flares, near-Earth objects, and launch cadence in one readable lane.',
  },
  {
    domain: 'Climate + environment',
    zeus: 'watch',
    jade: 'translated',
    aurea: 'framed',
    note: 'Separate real environmental stress from headline sensationalism.',
  },
  {
    domain: 'Biotech + public health',
    zeus: 'watch',
    jade: 'pending',
    aurea: 'watch',
    note: 'Reserve for cautious synthesis until stronger canonical pipelines are attached.',
  },
  {
    domain: 'AI + compute science',
    zeus: 'verified',
    jade: 'translated',
    aurea: 'framed',
    note: 'Track model, chip, and infrastructure advances without hype collapse.',
  },
];

export const frontierWatchItems: FrontierWatchItem[] = [
  {
    title: 'Seismic clustering surface',
    lane: 'earth',
    status: 'active',
    summary: 'USGS-class events and regional swarms should render as chronological watch items, not isolated shocks.',
  },
  {
    title: 'Solar weather translation lane',
    lane: 'space',
    status: 'watch',
    summary: 'Translate flare / CME language into practical civic impact: comms, power, and aviation relevance.',
  },
  {
    title: 'Climate extremes registry',
    lane: 'climate',
    status: 'watch',
    summary: 'Track flood, heat, storm, and drought signals with source freshness and confidence attached.',
  },
  {
    title: 'Biotech caution surface',
    lane: 'biotech',
    status: 'stable',
    summary: 'Keep a reserved lane for trusted synthesis once stronger canonical sources are connected.',
  },
  {
    title: 'AI / compute breakthroughs',
    lane: 'compute',
    status: 'active',
    summary: 'Show research milestones, chip shifts, and infra breakthroughs without slipping into hype-only framing.',
  },
];

export const civicScienceBrief = {
  title: 'C-262 Civic Science Brief',
  summary:
    'Mobius Science turns technical feeds into readable public signal. The point is not to sensationalize frontier data. The point is to preserve chronology, source integrity, uncertainty, and practical meaning.',
  bullets: [
    'What changed: science-native signals now have a dedicated chamber surface.',
    'What matters: timestamps stay canonical so signal order remains trustworthy.',
    'What JADE does: translate expert language into civic-readable summaries.',
    'What ZEUS does: verify source freshness and confidence before synthesis expands.',
    'What AUREA does: frame the signal as strategy, not spectacle.',
  ],
};

export const scienceRecords: ScienceRecord[] = [
  {
    timestamp: '2026-03-26 17:03 ET',
    title: 'Science chamber foundation sealed',
    source: 'Mobius internal scaffold',
    confidence: 'high',
    summary: 'Standalone science route and chamber cards established for C-262.',
  },
  {
    timestamp: '2026-03-26 16:51 ET',
    title: 'JADE civic translation lane prepared',
    source: 'JADE synthesis pattern',
    confidence: 'medium',
    summary: 'Technical language now has a civic-readable translation pattern for science watch items.',
  },
  {
    timestamp: '2026-03-26 16:40 ET',
    title: 'Canonical timestamp ordering enforced',
    source: 'Science governance rules',
    confidence: 'high',
    summary: 'Newest-first chronology preserved across science surfaces to prevent narrative drift.',
  },
];
