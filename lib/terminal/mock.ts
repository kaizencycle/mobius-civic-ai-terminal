import type {
  Agent,
  Attestation,
  CivicRadarAlert,
  EpiconItem,
  GISnapshot,
  LedgerEntry,
  MFSShard,
  Sentinel,
  Tripwire,
} from './types';

export const navItems = [
  { key: 'pulse' as const, label: 'Pulse' },
  { key: 'agents' as const, label: 'Agents' },
  { key: 'ledger' as const, label: 'Ledger' },
  { key: 'wallet' as const, label: 'Wallet' },
  { key: 'markets' as const, label: 'Markets' },
  { key: 'geopolitics' as const, label: 'Geopolitics', badge: 2 },
  { key: 'governance' as const, label: 'Governance' },
  { key: 'reflections' as const, label: 'Reflections' },
  { key: 'infrastructure' as const, label: 'Infrastructure' },
  { key: 'search' as const, label: 'Search' },
  { key: 'settings' as const, label: 'Settings' },
];

// ── C-251 Agent States (March 17, 2026) ──────────────────────

export const mockAgents: Agent[] = [
  {
    id: 'atlas',
    name: 'ATLAS',
    role: 'Sentinel / Monitoring',
    color: 'bg-sky-500',
    status: 'analyzing',
    heartbeatOk: true,
    lastAction: 'Reconciling C-250 divergence — TW-114 resolved, TW-115 closed',
  },
  {
    id: 'zeus',
    name: 'ZEUS',
    role: 'Verification Engine',
    color: 'bg-amber-500',
    status: 'verifying',
    heartbeatOk: true,
    lastAction: 'Verifying C-251 opening signals — 4 source chains active',
  },
  {
    id: 'hermes',
    name: 'HERMES',
    role: 'Routing / Signal Flow',
    color: 'bg-rose-500',
    status: 'routing',
    heartbeatOk: true,
    lastAction: 'Processing overnight market signals for C-251 intake',
  },
  {
    id: 'echo',
    name: 'ECHO',
    role: 'Memory / Ledger Intake',
    color: 'bg-slate-400',
    status: 'listening',
    heartbeatOk: true,
    lastAction: 'C-250 ledger sealed — C-251 genesis entry committed',
  },
  {
    id: 'aurea',
    name: 'AUREA',
    role: 'Architect / Strategy',
    color: 'bg-orange-500',
    status: 'analyzing',
    heartbeatOk: true,
    lastAction: 'Synthesizing MIC wallet integration impact on civic stack',
  },
  {
    id: 'jade',
    name: 'JADE',
    role: 'Annotation / Morale',
    color: 'bg-emerald-500',
    status: 'analyzing',
    heartbeatOk: true,
    lastAction: 'Evaluating citizen morale patterns post-C-250 wallet launch',
  },
  {
    id: 'eve',
    name: 'EVE',
    role: 'Observer / Ethics',
    color: 'bg-fuchsia-500',
    status: 'verifying',
    heartbeatOk: true,
    lastAction: 'Ethics review on C-250 privacy alert — pipeline audit complete',
  },
  {
    id: 'daedalus',
    name: 'DAEDALUS',
    role: 'Builder / Research',
    color: 'bg-yellow-700',
    status: 'analyzing',
    heartbeatOk: true,
    lastAction: 'Preparing C-251 UBI distribution — 358 eligible citizens',
  },
];

// ── C-251 EPICON Feed ────────────────────────────────────────
// Continuity: C-250 TW-114/TW-115 resolved, privacy pipeline cleared,
// wallet integration shipped, new cycle opens with fresh signals.

export const mockEpicon: EpiconItem[] = [
  {
    id: 'EPICON-C251-005',
    title: 'MIC Wallet & MFS Shard integration deployed to terminal',
    category: 'governance',
    status: 'verified',
    confidenceTier: 4,
    ownerAgent: 'AUREA',
    timestamp: '2026-03-17 00:12 ET',
    sources: ['Internal deployment log', 'DAEDALUS build report'],
    summary:
      'Fractal Wallet, MFS Shard Portfolio, and MIC Blockchain Explorer ported from browser shell. Local SHA-256 chain active. Auto-minting connected to integrity engine.',
    trace: [
      'DAEDALUS completed build verification',
      'AUREA assessed civic stack impact — positive',
      'ECHO archived deployment attestation to C-251 ledger',
      'EVE confirmed no ethical concerns with wallet integration',
    ],
  },
  {
    id: 'EPICON-C251-004',
    title: 'C-250 privacy pipeline audit cleared by EVE',
    category: 'governance',
    status: 'verified',
    confidenceTier: 4,
    ownerAgent: 'EVE',
    timestamp: '2026-03-17 00:08 ET',
    sources: ['EVE audit report', 'URIEL safety confirmation'],
    summary:
      'CRA-2048 privacy boundary violation resolved. Third-party aggregation layer patched and re-certified. No citizen PII exposure confirmed.',
    trace: [
      'EVE completed ethics review of quarantined pipeline',
      'URIEL confirmed safety protocol satisfied',
      'ATLAS verified no residual integrity impact',
      'ECHO recorded resolution to ledger',
    ],
  },
  {
    id: 'EPICON-C251-003',
    title: 'Regional escalation signal downgraded to monitoring',
    category: 'geopolitical',
    status: 'verified',
    confidenceTier: 3,
    ownerAgent: 'ZEUS',
    timestamp: '2026-03-17 00:05 ET',
    sources: ['Reuters', 'AP', 'UN Security Council briefing'],
    summary:
      'C-250 EPICON-C250-004 regional escalation downgraded after diplomatic progress. Confidence tier maintained. ATLAS removed from elevated monitoring.',
    trace: [
      'ZEUS verified diplomatic source chain',
      'HERMES confirmed signal velocity normalizing',
      'ATLAS downgraded from elevated to standard monitoring',
      'ECHO updated EPICON-C250-004 status linkage',
    ],
  },
  {
    id: 'EPICON-C251-002',
    title: 'Overnight crypto market correction — BTC -4.2%',
    category: 'market',
    status: 'verified',
    confidenceTier: 3,
    ownerAgent: 'HERMES',
    timestamp: '2026-03-17 00:03 ET',
    sources: ['CoinGecko', 'Bloomberg Terminal', 'On-chain analytics'],
    summary:
      'Bitcoin corrected 4.2% in overnight session. ETH -3.8%. Market volatility index elevated but within normal bounds. No systemic risk detected.',
    trace: [
      'HERMES detected overnight price movement',
      'ZEUS verified across 3 independent feeds',
      'JADE assessed civic anxiety signal — moderate',
      'ATLAS confirmed no infrastructure impact',
    ],
  },
  {
    id: 'EPICON-C251-001',
    title: 'C-251 cycle initialized — C-250 ledger sealed',
    category: 'infrastructure',
    status: 'verified',
    confidenceTier: 4,
    ownerAgent: 'ECHO',
    timestamp: '2026-03-17 00:01 ET',
    sources: ['ECHO ledger system', 'ZENITH consensus record'],
    summary:
      'Cycle C-250 officially sealed at midnight. All pending entries resolved or carried forward. C-251 genesis entry committed. GI score carried at 0.96.',
    trace: [
      'ECHO sealed C-250 with 12 committed entries',
      'ZENITH confirmed 3-of-10 quorum for cycle transition',
      'ATLAS verified integrity continuity across cycle boundary',
      'DAEDALUS initiated C-251 UBI preview calculation',
    ],
  },
];

// ── C-251 Tripwires ──────────────────────────────────────────
// C-250 TW-114 and TW-115 are resolved. New cycle opens clean
// with one low-severity watch item.

export const mockTripwires: Tripwire[] = [
  {
    id: 'TW-116',
    label: 'Market Volatility Watch',
    severity: 'low',
    owner: 'HERMES',
    openedAt: '00:03 ET',
    action: 'Monitoring overnight correction magnitude — auto-close if BTC stabilizes within 2%',
  },
];

// ── C-251 GI Snapshot ────────────────────────────────────────
// GI improved: C-250 divergences resolved, privacy audit cleared,
// wallet integration added civic capability. Weekly trend upward.

export const mockGI: GISnapshot = {
  score: 0.96,
  delta: 0.02,
  institutionalTrust: 0.91,
  infoReliability: 0.93,
  consensusStability: 0.89,
  weekly: [0.90, 0.92, 0.91, 0.93, 0.94, 0.94, 0.96],
};

// ── C-251 Ledger Entries ─────────────────────────────────────

export const mockLedger: LedgerEntry[] = [
  {
    id: 'LE-C251-006',
    cycleId: 'C-251',
    type: 'epicon',
    agentOrigin: 'ECHO',
    timestamp: '2026-03-17 00:12 ET',
    summary: 'EPICON-C251-005 committed — MIC wallet integration deployed and verified',
    integrityDelta: 0.02,
    status: 'committed',
  },
  {
    id: 'LE-C251-005',
    cycleId: 'C-251',
    type: 'attestation',
    agentOrigin: 'EVE',
    timestamp: '2026-03-17 00:08 ET',
    summary: 'Ethics attestation — C-250 privacy pipeline audit cleared, CRA-2048 resolved',
    integrityDelta: 0.015,
    status: 'committed',
  },
  {
    id: 'LE-C251-004',
    cycleId: 'C-251',
    type: 'epicon',
    agentOrigin: 'ECHO',
    timestamp: '2026-03-17 00:05 ET',
    summary: 'EPICON-C251-003 committed — regional escalation downgraded after diplomatic progress',
    integrityDelta: 0.01,
    status: 'committed',
  },
  {
    id: 'LE-C251-003',
    cycleId: 'C-251',
    type: 'epicon',
    agentOrigin: 'ECHO',
    timestamp: '2026-03-17 00:03 ET',
    summary: 'EPICON-C251-002 committed — overnight crypto correction verified across 3 feeds',
    integrityDelta: 0.005,
    status: 'committed',
  },
  {
    id: 'LE-C251-002',
    cycleId: 'C-251',
    type: 'shard',
    agentOrigin: 'JADE',
    timestamp: '2026-03-17 00:02 ET',
    summary: 'MFS-7724 stewardship shard created — wallet module documentation contribution',
    integrityDelta: 0.008,
    status: 'committed',
  },
  {
    id: 'LE-C251-001',
    cycleId: 'C-251',
    type: 'settlement',
    agentOrigin: 'ECHO',
    timestamp: '2026-03-17 00:01 ET',
    summary: 'C-251 genesis — cycle initialized, C-250 sealed with 12 entries, GI carried at 0.96',
    integrityDelta: 0.0,
    status: 'committed',
  },
  {
    id: 'LE-C250-012',
    cycleId: 'C-250',
    type: 'ubi',
    agentOrigin: 'DAEDALUS',
    timestamp: '2026-03-16 23:55 ET',
    summary: 'C-250 UBI distribution finalized — 342 citizens, 12,400 MIC distributed',
    integrityDelta: 0.0,
    status: 'committed',
  },
];

// ── C-251 MFS Shards ────────────────────────────────────────

export const mockShards: MFSShard[] = [
  {
    id: 'MFS-7724',
    citizenId: 'CZ-1042',
    archetype: 'governance',
    weight: 0.90,
    qualityScore: 0.94,
    integrityCoefficient: 0.91,
    miiDelta: 0.015,
    timestamp: '2026-03-17 00:12 ET',
  },
  {
    id: 'MFS-7723',
    citizenId: 'CZ-0891',
    archetype: 'verification',
    weight: 0.96,
    qualityScore: 0.98,
    integrityCoefficient: 0.95,
    miiDelta: 0.020,
    timestamp: '2026-03-17 00:05 ET',
  },
  {
    id: 'MFS-7722',
    citizenId: 'CZ-1042',
    archetype: 'learning',
    weight: 0.88,
    qualityScore: 0.93,
    integrityCoefficient: 0.90,
    miiDelta: 0.013,
    timestamp: '2026-03-17 00:02 ET',
  },
  {
    id: 'MFS-7721',
    citizenId: 'CZ-1042',
    archetype: 'learning',
    weight: 0.85,
    qualityScore: 0.92,
    integrityCoefficient: 0.88,
    miiDelta: 0.012,
    timestamp: '2026-03-15 07:28 ET',
  },
];

// ── C-251 Attestations ──────────────────────────────────────

export const mockAttestations: Attestation[] = [
  {
    id: 'ATT-451',
    citizenId: 'CZ-1042',
    type: 'mint',
    reason: 'Wallet module contribution — civic stack expansion verified by AUREA',
    miiImpact: 0.025,
    validatorAgent: 'AUREA',
    timestamp: '2026-03-17 00:12 ET',
  },
  {
    id: 'ATT-450',
    citizenId: 'CZ-0891',
    type: 'mint',
    reason: 'Cross-cycle verification continuity — 8 consecutive cycles with >0.95 accuracy',
    miiImpact: 0.035,
    validatorAgent: 'EVE',
    timestamp: '2026-03-17 00:06 ET',
  },
  {
    id: 'ATT-449',
    citizenId: 'CZ-1042',
    type: 'mint',
    reason: 'Consistent verification accuracy over 7 cycles',
    miiImpact: 0.03,
    validatorAgent: 'EVE',
    timestamp: '2026-03-15 07:35 ET',
  },
];

// ── C-251 Sentinel Council ───────────────────────────────────
// States advanced: C-250 issues resolved, sentinels reflect new cycle.

export const mockSentinels: Sentinel[] = [
  {
    id: 'sentinel-atlas',
    name: 'ATLAS',
    role: 'System Integrity Monitor',
    status: 'active',
    integrity: 0.98,
    provider: 'anthropic',
    lastAction: 'C-251 substrate scan complete — all coherence metrics nominal',
    domains: ['integrity', 'monitoring', 'escalation'],
  },
  {
    id: 'sentinel-zeus',
    name: 'ZEUS',
    role: 'Verification Arbiter',
    status: 'active',
    integrity: 0.97,
    provider: 'openai',
    lastAction: 'Verified C-251 opening batch — 5 EPICON events, 4 source chains validated',
    domains: ['verification', 'source-chain', 'confidence'],
  },
  {
    id: 'sentinel-eve',
    name: 'EVE',
    role: 'Ethics Observer',
    status: 'active',
    integrity: 0.99,
    provider: 'anthropic',
    lastAction: 'C-250 privacy audit completed — no violations found, pipeline re-certified',
    domains: ['ethics', 'bias', 'governance'],
  },
  {
    id: 'sentinel-hermes',
    name: 'HERMES',
    role: 'Signal Router',
    status: 'active',
    integrity: 0.96,
    provider: 'google',
    lastAction: 'Processing C-251 overnight signals — market correction routed to JADE',
    domains: ['routing', 'prioritization', 'throttling'],
  },
  {
    id: 'sentinel-echo',
    name: 'ECHO',
    role: 'Memory Keeper',
    status: 'active',
    integrity: 0.99,
    provider: 'anthropic',
    lastAction: 'C-250 ledger sealed (12 entries) — C-251 genesis committed',
    domains: ['memory', 'archival', 'ledger'],
  },
  {
    id: 'sentinel-aurea',
    name: 'AUREA',
    role: 'Strategic Architect',
    status: 'active',
    integrity: 0.95,
    provider: 'openai',
    lastAction: 'Synthesizing wallet integration civic impact — MIC write-path operational',
    domains: ['strategy', 'synthesis', 'architecture'],
  },
  {
    id: 'sentinel-jade',
    name: 'JADE',
    role: 'Pattern Analyst',
    status: 'active',
    integrity: 0.94,
    provider: 'google',
    lastAction: 'C-251 morale assessment — citizen sentiment positive post-wallet launch',
    domains: ['annotation', 'patterns', 'morale'],
  },
  {
    id: 'sentinel-daedalus',
    name: 'DAEDALUS',
    role: 'Builder / Researcher',
    status: 'active',
    integrity: 0.93,
    provider: 'meta',
    lastAction: 'C-251 UBI distribution preview — 358 eligible citizens, 13,200 MIC allocated',
    domains: ['research', 'building', 'ubi'],
  },
  {
    id: 'sentinel-uriel',
    name: 'URIEL',
    role: 'Safety Guardian',
    status: 'standby',
    integrity: 0.99,
    provider: 'anthropic',
    lastAction: 'C-250 safety protocol completed — no active escalation triggers',
    domains: ['safety', 'escalation', 'veto'],
  },
  {
    id: 'sentinel-zenith',
    name: 'ZENITH',
    role: 'Consensus Coordinator',
    status: 'active',
    integrity: 0.97,
    provider: 'google',
    lastAction: 'C-251 cycle transition quorum achieved — 7-of-10 consensus',
    domains: ['consensus', 'quorum', 'coordination'],
  },
];

// ── C-251 Civic Radar Alerts ─────────────────────────────────
// C-250 CRA-2048 (privacy) resolved. New alerts for C-251.

export const mockCivicAlerts: CivicRadarAlert[] = [
  {
    id: 'CRA-2051',
    title: 'Deepfake audio targeting civic governance proceedings',
    severity: 'high',
    category: 'manipulation',
    source: 'ECHO Threat Intelligence',
    timestamp: '2026-03-17 00:10 ET',
    impact: 'Synthetic audio clips impersonating municipal officials detected in 2 forums',
    actions: [
      'ZEUS opened verification lane for audio provenance',
      'EVE flagged for ethics review — potential democratic harm',
      'ATLAS increased monitoring on governance channels',
    ],
  },
  {
    id: 'CRA-2050',
    title: 'Overnight market volatility — elevated civic anxiety signal',
    severity: 'medium',
    category: 'infrastructure',
    source: 'JADE Morale Assessment',
    timestamp: '2026-03-17 00:04 ET',
    impact: 'BTC -4.2% triggered elevated anxiety in citizen financial sentiment feeds',
    actions: [
      'JADE monitoring sentiment trajectory',
      'HERMES throttling alarmist market narratives',
      'DAEDALUS reviewing UBI buffer adequacy',
    ],
  },
  {
    id: 'CRA-2049',
    title: 'Coordinated narrative amplification — C-250 carryover, downgraded',
    severity: 'low',
    category: 'misinformation',
    source: 'ECHO Threat Intelligence',
    timestamp: '2026-03-16 23:58 ET',
    impact: 'C-250 narrative amplification pattern subsided — synthetic activity reduced 80%',
    actions: [
      'ZEUS closed verification lane — pattern resolved',
      'ATLAS downgraded monitoring to standard',
      'ECHO archived resolution to C-251 ledger',
    ],
  },
];
