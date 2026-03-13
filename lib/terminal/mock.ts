import type { Agent, EpiconItem, GISnapshot, Tripwire } from './types';

export const navItems = [
  { key: 'pulse' as const, label: 'Pulse' },
  { key: 'agents' as const, label: 'Agents' },
  { key: 'ledger' as const, label: 'Ledger' },
  { key: 'markets' as const, label: 'Markets' },
  { key: 'geopolitics' as const, label: 'Geopolitics', badge: 2 },
  { key: 'governance' as const, label: 'Governance' },
  { key: 'reflections' as const, label: 'Reflections' },
  { key: 'infrastructure' as const, label: 'Infrastructure' },
  { key: 'search' as const, label: 'Search' },
  { key: 'settings' as const, label: 'Settings' },
];

export const mockAgents: Agent[] = [
  {
    id: 'atlas',
    name: 'ATLAS',
    role: 'Sentinel / Monitoring',
    color: 'bg-sky-500',
    status: 'analyzing',
    heartbeatOk: true,
    lastAction: 'Scanning substrate integrity',
  },
  {
    id: 'zeus',
    name: 'ZEUS',
    role: 'Verification Engine',
    color: 'bg-amber-500',
    status: 'verifying',
    heartbeatOk: true,
    lastAction: 'Cross-checking source chain',
  },
  {
    id: 'hermes',
    name: 'HERMES',
    role: 'Routing / Signal Flow',
    color: 'bg-rose-500',
    status: 'routing',
    heartbeatOk: true,
    lastAction: 'Routing geopolitical signal',
  },
  {
    id: 'echo',
    name: 'ECHO',
    role: 'Memory / Ledger Intake',
    color: 'bg-slate-400',
    status: 'listening',
    heartbeatOk: true,
    lastAction: 'Recording EPICON snapshot',
  },
  {
    id: 'aurea',
    name: 'AUREA',
    role: 'Architect / Strategy',
    color: 'bg-orange-500',
    status: 'analyzing',
    heartbeatOk: true,
    lastAction: 'Drafting civic synthesis',
  },
  {
    id: 'jade',
    name: 'JADE',
    role: 'Annotation / Morale',
    color: 'bg-emerald-500',
    status: 'idle',
    heartbeatOk: true,
    lastAction: 'Awaiting next reflection input',
  },
  {
    id: 'eve',
    name: 'EVE',
    role: 'Observer / Ethics',
    color: 'bg-fuchsia-500',
    status: 'idle',
    heartbeatOk: true,
    lastAction: 'Observing cross-agent output',
  },
  {
    id: 'daedalus',
    name: 'DAEDALUS',
    role: 'Builder / Research',
    color: 'bg-yellow-700',
    status: 'analyzing',
    heartbeatOk: true,
    lastAction: 'Compiling terminal module sketch',
  },
];

export const mockEpicon: EpiconItem[] = [
  {
    id: 'EPICON-C249-004',
    title: 'Regional escalation signal updated',
    category: 'geopolitical',
    status: 'verified',
    confidenceTier: 3,
    ownerAgent: 'ZEUS',
    timestamp: '2026-03-13 07:41 ET',
    sources: ['Reuters', 'AP', 'Official advisory'],
    summary:
      'Signal upgraded after multi-source verification. Event remains active but below alliance-trigger threshold.',
    trace: [
      'ECHO captured initial signal',
      'HERMES routed for verification',
      'ZEUS confirmed with 3 source alignment',
      'ATLAS updated system integrity context',
    ],
  },
  {
    id: 'EPICON-C249-003',
    title: 'Mobius Terminal V1 layout drafted',
    category: 'governance',
    status: 'verified',
    confidenceTier: 4,
    ownerAgent: 'AUREA',
    timestamp: '2026-03-13 07:28 ET',
    sources: ['Internal design memo'],
    summary:
      'Initial civic terminal layout finalized for operator view with command canvas, right inspector, and agent cortex.',
    trace: [
      'AUREA created layout model',
      'DAEDALUS prepared implementation notes',
      'ECHO archived design record',
    ],
  },
  {
    id: 'EPICON-C249-002',
    title: 'Tripwire divergence on conflict narratives',
    category: 'infrastructure',
    status: 'pending',
    confidenceTier: 2,
    ownerAgent: 'ATLAS',
    timestamp: '2026-03-13 07:16 ET',
    sources: ['Open web', 'Regional reporting'],
    summary:
      'Narrative velocity exceeded verification speed. System placed event into caution state pending source reconciliation.',
    trace: [
      'ATLAS flagged divergence',
      'ZEUS opened verification lane',
      'HERMES throttled propagation',
    ],
  },
  {
    id: 'EPICON-C249-001',
    title: 'Market sweep awaiting fresh inputs',
    category: 'market',
    status: 'contradicted',
    confidenceTier: 1,
    ownerAgent: 'HERMES',
    timestamp: '2026-03-13 06:58 ET',
    sources: ['Secondary feed'],
    summary:
      'Pre-open market interpretation was rejected after source inconsistency. Feed requires refresh before publication.',
    trace: [
      'HERMES routed market signal',
      'ZEUS found inconsistency',
      'ATLAS suppressed downstream amplification',
    ],
  },
];

export const mockTripwires: Tripwire[] = [
  {
    id: 'TW-114',
    label: 'Information Surge',
    severity: 'medium',
    owner: 'ATLAS',
    openedAt: '07:16 ET',
    action: 'Throttled propagation pending ZEUS review',
  },
  {
    id: 'TW-115',
    label: 'Source Divergence',
    severity: 'high',
    owner: 'ZEUS',
    openedAt: '07:21 ET',
    action: 'Awaiting primary-source confirmation',
  },
];

export const mockGI: GISnapshot = {
  score: 0.94,
  delta: 0.01,
  institutionalTrust: 0.88,
  infoReliability: 0.91,
  consensusStability: 0.86,
  weekly: [0.89, 0.9, 0.9, 0.92, 0.91, 0.93, 0.94],
};
