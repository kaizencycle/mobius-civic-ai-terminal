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
  { key: 'geopolitics' as const, label: 'Geopolitics', badge: 5 },
  { key: 'governance' as const, label: 'Governance' },
  { key: 'reflections' as const, label: 'Reflections' },
  { key: 'infrastructure' as const, label: 'Infrastructure' },
  { key: 'search' as const, label: 'Search' },
  { key: 'settings' as const, label: 'Settings' },
];

// ── C-253 Agent States (March 17, 2026 · 10:06 ET) ──────────
// Iran–Hormuz crisis active. All agents engaged. Maximum alert posture.

export const mockAgents: Agent[] = [
  {
    id: 'atlas',
    name: 'ATLAS',
    role: 'Sentinel / Monitoring',
    color: 'bg-sky-500',
    status: 'alert',
    heartbeatOk: true,
    lastAction: 'Elevated monitoring — Hormuz chokepoint disruption, energy supply chain stress',
  },
  {
    id: 'zeus',
    name: 'ZEUS',
    role: 'Verification Engine',
    color: 'bg-amber-500',
    status: 'verifying',
    heartbeatOk: true,
    lastAction: 'Verifying yuan-passage claims — no high-confidence source found, marked UNVERIFIED',
  },
  {
    id: 'hermes',
    name: 'HERMES',
    role: 'Routing / Signal Flow',
    color: 'bg-rose-500',
    status: 'routing',
    heartbeatOk: true,
    lastAction: 'Routing Hormuz energy signals — throttling alarmist narratives, prioritizing verified feeds',
  },
  {
    id: 'echo',
    name: 'ECHO',
    role: 'Memory / Ledger Intake',
    color: 'bg-slate-400',
    status: 'listening',
    heartbeatOk: true,
    lastAction: 'Recording C-253-E001 through E003 — Hormuz, markets, narrative layers committed',
  },
  {
    id: 'aurea',
    name: 'AUREA',
    role: 'Architect / Strategy',
    color: 'bg-orange-500',
    status: 'analyzing',
    heartbeatOk: true,
    lastAction: 'Synthesizing petrodollar structural analysis — energy→currency→military cascade model',
  },
  {
    id: 'jade',
    name: 'JADE',
    role: 'Annotation / Morale',
    color: 'bg-emerald-500',
    status: 'analyzing',
    heartbeatOk: true,
    lastAction: 'Elevated civic anxiety detected — sentiment feeds show fear amplification in financial channels',
  },
  {
    id: 'eve',
    name: 'EVE',
    role: 'Observer / Ethics',
    color: 'bg-fuchsia-500',
    status: 'verifying',
    heartbeatOk: true,
    lastAction: 'Ethics review on narrative distortion vectors — flagging manipulation risk in governance channels',
  },
  {
    id: 'daedalus',
    name: 'DAEDALUS',
    role: 'Builder / Research',
    color: 'bg-yellow-700',
    status: 'analyzing',
    heartbeatOk: true,
    lastAction: 'Signal Engine V1 deployed — scoring pipeline active for C-253 events',
  },
];

// ── C-253 EPICON Feed ────────────────────────────────────────
// Iran–Hormuz crisis. Three-layer analysis: Event → Market → Narrative.

export const mockEpicon: EpiconItem[] = [
  {
    id: 'EPICON-C253-003',
    title: 'Narrative war: multi-layer perception divergence across Hormuz crisis',
    category: 'geopolitical',
    status: 'verified',
    confidenceTier: 3,
    ownerAgent: 'AUREA',
    timestamp: '2026-03-17 10:48 ET',
    sources: ['ECHO Threat Intelligence', 'Social media analysis', 'State media monitoring', 'Independent analysts'],
    summary:
      'Multi-layer narrative divergence forming: mainstream media cautious ("regional instability"), social platforms extreme ("WW3 imminent"), state messaging strategic. Self-reinforcing feedback loop detected: narrative → market → price confirms fear → more narrative. GII delta -0.06.',
    trace: [
      'ECHO detected narrative divergence across 4 information layers',
      'AUREA classified perception field structure — 4 actor types identified',
      'JADE flagged cognitive impact — numbness and fear amplification patterns',
      'EVE opened ethics review on manipulation vectors in governance channels',
      'ZEUS confirmed core signal stable but distortion field extreme',
    ],
  },
  {
    id: 'EPICON-C253-002',
    title: 'Market cascade: oil spike, BTC volatile, gold safe-haven flows, DXY mixed',
    category: 'market',
    status: 'verified',
    confidenceTier: 3,
    ownerAgent: 'HERMES',
    timestamp: '2026-03-17 10:32 ET',
    sources: ['Bloomberg Terminal', 'CoinGecko', 'On-chain analytics', 'Reuters Markets'],
    summary:
      'Global markets reacting to Hormuz disruption. Brent ~$102, gold up (fear hedge), BTC volatile (competing "digital gold" vs "risk asset" narratives), DXY mixed (safe-haven short-term vs structural pressure long-term), equities pressured. Classic macro cascade: energy shock → cost increase → margin compression → risk repricing. GII delta -0.04.',
    trace: [
      'HERMES routed overnight market signals for C-253 intake',
      'ZEUS verified oil/gold/BTC/DXY moves across 3+ independent feeds',
      'JADE assessed civic anxiety signal — elevated in financial sentiment channels',
      'ATLAS confirmed no infrastructure systemic risk — monitoring continues',
      'AUREA synthesized structural insight: narrative competition amplifying market reflexivity',
    ],
  },
  {
    id: 'EPICON-C253-001',
    title: 'Strait of Hormuz under severe disruption — selective passage negotiated',
    category: 'geopolitical',
    status: 'verified',
    confidenceTier: 3,
    ownerAgent: 'ZEUS',
    timestamp: '2026-03-17 10:18 ET',
    sources: ['Reuters', 'AP', 'IMO advisory', 'UN Security Council briefing'],
    summary:
      'Iran conflict has disrupted Hormuz — ~20% of global oil/LNG transit. Verified: severe strain, selective bilateral passage (Pakistan, Iraq negotiating with Iran), Brent ~$102, Gulf exports down 60%. UNVERIFIED: formal yuan-only passage policy. Structural analysis: even partial non-USD energy settlement pressures petrodollar system at margin. Military-energy logistics stress elevated.',
    trace: [
      'ECHO captured initial Hormuz disruption signal from multiple feeds',
      'ZEUS cross-verified across Reuters, AP, IMO — confirmed disruption, rejected yuan-only claim',
      'HERMES routed to geopolitical + market verification lanes',
      'ATLAS elevated monitoring — chokepoint risk to global energy system',
      'AUREA synthesized petrodollar structural analysis — 3-stage cascade model',
    ],
  },
  {
    id: 'EPICON-C253-000',
    title: 'C-253 cycle initialized — Signal Engine V1 deployed',
    category: 'infrastructure',
    status: 'verified',
    confidenceTier: 4,
    ownerAgent: 'ECHO',
    timestamp: '2026-03-17 10:06 ET',
    sources: ['ECHO ledger system', 'DAEDALUS build report'],
    summary:
      'Cycle C-253 opened at operator clock-in. Signal Engine V1 deployed — every EPICON event now scored across signal/narrative/volatility dimensions with SIGNAL/EMERGING/DISTORTION classification. Cycle health monitoring active.',
    trace: [
      'ECHO committed C-253 genesis entry at operator clock-in',
      'DAEDALUS deployed Signal Engine V1 scoring pipeline',
      'ZENITH confirmed cycle transition quorum',
      'ATLAS verified substrate integrity — all systems nominal',
    ],
  },
];

// ── C-253 Tripwires ──────────────────────────────────────────
// Major geopolitical crisis — multiple active tripwires.

export const mockTripwires: Tripwire[] = [
  {
    id: 'TW-120',
    label: 'Hormuz Chokepoint Disruption',
    severity: 'high',
    owner: 'ATLAS',
    openedAt: '10:18 ET',
    action: 'Elevated monitoring — 20% global oil transit affected, supply chain stress active',
  },
  {
    id: 'TW-121',
    label: 'Narrative Distortion Field',
    severity: 'high',
    owner: 'ZEUS',
    openedAt: '10:48 ET',
    action: 'Extreme narrative noise — "WW3", "petrodollar collapse" claims circulating without verification',
  },
  {
    id: 'TW-119',
    label: 'Energy Market Volatility',
    severity: 'medium',
    owner: 'HERMES',
    openedAt: '10:32 ET',
    action: 'Brent ~$102, cross-asset volatility elevated — monitoring for systemic contagion',
  },
  {
    id: 'TW-118',
    label: 'Yuan-Passage Claim',
    severity: 'medium',
    owner: 'ZEUS',
    openedAt: '10:20 ET',
    action: 'Unverified claim — no high-confidence source confirms yuan-only Hormuz passage policy',
  },
];

// ── C-253 GI Snapshot ────────────────────────────────────────
// GI dropped: Hormuz crisis introduces real geopolitical stress,
// narrative noise extreme, market volatility elevated.

export const mockGI: GISnapshot = {
  score: 0.83,
  delta: -0.13,
  institutionalTrust: 0.82,
  infoReliability: 0.74,
  consensusStability: 0.78,
  weekly: [0.94, 0.96, 0.95, 0.93, 0.91, 0.88, 0.83],
};

// ── C-253 Ledger Entries ─────────────────────────────────────

export const mockLedger: LedgerEntry[] = [
  {
    id: 'LE-C253-006',
    cycleId: 'C-253',
    type: 'epicon',
    agentOrigin: 'ECHO',
    timestamp: '2026-03-17 10:48 ET',
    summary: 'EPICON-C253-003 committed — narrative war layer analysis, multi-platform distortion field mapped',
    integrityDelta: -0.06,
    status: 'committed',
  },
  {
    id: 'LE-C253-005',
    cycleId: 'C-253',
    type: 'attestation',
    agentOrigin: 'EVE',
    timestamp: '2026-03-17 10:45 ET',
    summary: 'Ethics attestation — manipulation vectors flagged in governance channels, deepfake audio detected',
    integrityDelta: -0.02,
    status: 'committed',
  },
  {
    id: 'LE-C253-004',
    cycleId: 'C-253',
    type: 'epicon',
    agentOrigin: 'ECHO',
    timestamp: '2026-03-17 10:32 ET',
    summary: 'EPICON-C253-002 committed — market cascade verified: oil, gold, BTC, DXY, equities',
    integrityDelta: -0.04,
    status: 'committed',
  },
  {
    id: 'LE-C253-003',
    cycleId: 'C-253',
    type: 'epicon',
    agentOrigin: 'ECHO',
    timestamp: '2026-03-17 10:18 ET',
    summary: 'EPICON-C253-001 committed — Hormuz disruption verified, yuan-passage claim marked UNVERIFIED',
    integrityDelta: -0.03,
    status: 'committed',
  },
  {
    id: 'LE-C253-002',
    cycleId: 'C-253',
    type: 'shard',
    agentOrigin: 'JADE',
    timestamp: '2026-03-17 10:15 ET',
    summary: 'MFS-7730 protection shard created — civic anxiety monitoring during Hormuz crisis',
    integrityDelta: 0.005,
    status: 'committed',
  },
  {
    id: 'LE-C253-001',
    cycleId: 'C-253',
    type: 'settlement',
    agentOrigin: 'ECHO',
    timestamp: '2026-03-17 10:06 ET',
    summary: 'C-253 genesis — operator clock-in, Signal Engine V1 deployed, crisis monitoring activated',
    integrityDelta: 0.0,
    status: 'committed',
  },
  {
    id: 'LE-C252-014',
    cycleId: 'C-252',
    type: 'ubi',
    agentOrigin: 'DAEDALUS',
    timestamp: '2026-03-16 23:58 ET',
    summary: 'C-252 UBI distribution finalized — 358 citizens, 13,200 MIC distributed',
    integrityDelta: 0.0,
    status: 'committed',
  },
];

// ── C-253 MFS Shards ────────────────────────────────────────

export const mockShards: MFSShard[] = [
  {
    id: 'MFS-7730',
    citizenId: 'CZ-1042',
    archetype: 'protection',
    weight: 0.92,
    qualityScore: 0.95,
    integrityCoefficient: 0.91,
    miiDelta: 0.018,
    timestamp: '2026-03-17 10:48 ET',
  },
  {
    id: 'MFS-7729',
    citizenId: 'CZ-0891',
    archetype: 'verification',
    weight: 0.97,
    qualityScore: 0.99,
    integrityCoefficient: 0.96,
    miiDelta: 0.022,
    timestamp: '2026-03-17 10:18 ET',
  },
  {
    id: 'MFS-7728',
    citizenId: 'CZ-1042',
    archetype: 'governance',
    weight: 0.88,
    qualityScore: 0.91,
    integrityCoefficient: 0.87,
    miiDelta: 0.014,
    timestamp: '2026-03-17 10:06 ET',
  },
];

// ── C-253 Attestations ──────────────────────────────────────

export const mockAttestations: Attestation[] = [
  {
    id: 'ATT-455',
    citizenId: 'CZ-1042',
    type: 'mint',
    reason: 'Signal Engine contribution — civic infrastructure expansion verified by DAEDALUS',
    miiImpact: 0.03,
    validatorAgent: 'DAEDALUS',
    timestamp: '2026-03-17 10:06 ET',
  },
  {
    id: 'ATT-454',
    citizenId: 'CZ-0891',
    type: 'mint',
    reason: 'Hormuz crisis verification — cross-source chain accuracy under pressure',
    miiImpact: 0.025,
    validatorAgent: 'ZEUS',
    timestamp: '2026-03-17 10:20 ET',
  },
  {
    id: 'ATT-453',
    citizenId: 'CZ-1042',
    type: 'mint',
    reason: 'Narrative distortion mapping — structural analysis contribution',
    miiImpact: 0.02,
    validatorAgent: 'EVE',
    timestamp: '2026-03-17 10:50 ET',
  },
];

// ── C-253 Sentinel Council ───────────────────────────────────
// Crisis posture. Most sentinels active. URIEL elevated.

export const mockSentinels: Sentinel[] = [
  {
    id: 'sentinel-atlas',
    name: 'ATLAS',
    role: 'System Integrity Monitor',
    status: 'active',
    integrity: 0.95,
    provider: 'anthropic',
    lastAction: 'Elevated monitoring — Hormuz chokepoint risk to global energy infrastructure',
    domains: ['integrity', 'monitoring', 'escalation'],
  },
  {
    id: 'sentinel-zeus',
    name: 'ZEUS',
    role: 'Verification Arbiter',
    status: 'active',
    integrity: 0.97,
    provider: 'openai',
    lastAction: 'Hormuz verification: disruption CONFIRMED, yuan-only REJECTED, bilateral passage CONFIRMED',
    domains: ['verification', 'source-chain', 'confidence'],
  },
  {
    id: 'sentinel-eve',
    name: 'EVE',
    role: 'Ethics Observer',
    status: 'active',
    integrity: 0.98,
    provider: 'anthropic',
    lastAction: 'Flagging narrative manipulation vectors — deepfake audio + astroturfing patterns active',
    domains: ['ethics', 'bias', 'governance'],
  },
  {
    id: 'sentinel-hermes',
    name: 'HERMES',
    role: 'Signal Router',
    status: 'active',
    integrity: 0.94,
    provider: 'google',
    lastAction: 'Throttling alarmist market narratives — prioritizing verified Reuters/AP/IMO feeds',
    domains: ['routing', 'prioritization', 'throttling'],
  },
  {
    id: 'sentinel-echo',
    name: 'ECHO',
    role: 'Memory Keeper',
    status: 'active',
    integrity: 0.99,
    provider: 'anthropic',
    lastAction: 'C-253 crisis ledger active — 6 entries committed, 3 EPICON events archived',
    domains: ['memory', 'archival', 'ledger'],
  },
  {
    id: 'sentinel-aurea',
    name: 'AUREA',
    role: 'Strategic Architect',
    status: 'active',
    integrity: 0.95,
    provider: 'openai',
    lastAction: 'Petrodollar structural analysis: 3-stage cascade model (shipping→bilateral→reserve diversification)',
    domains: ['strategy', 'synthesis', 'architecture'],
  },
  {
    id: 'sentinel-jade',
    name: 'JADE',
    role: 'Pattern Analyst',
    status: 'active',
    integrity: 0.93,
    provider: 'google',
    lastAction: 'Civic anxiety elevated — fear amplification in financial sentiment feeds, cognitive impact flagged',
    domains: ['annotation', 'patterns', 'morale'],
  },
  {
    id: 'sentinel-daedalus',
    name: 'DAEDALUS',
    role: 'Builder / Researcher',
    status: 'active',
    integrity: 0.94,
    provider: 'meta',
    lastAction: 'Signal Engine V1 deployed — scoring pipeline active, cycle health monitoring operational',
    domains: ['research', 'building', 'ubi'],
  },
  {
    id: 'sentinel-uriel',
    name: 'URIEL',
    role: 'Safety Guardian',
    status: 'active',
    integrity: 0.99,
    provider: 'anthropic',
    lastAction: 'Safety protocol ELEVATED — monitoring escalation paths during Hormuz crisis',
    domains: ['safety', 'escalation', 'veto'],
  },
  {
    id: 'sentinel-zenith',
    name: 'ZENITH',
    role: 'Consensus Coordinator',
    status: 'consensus',
    integrity: 0.96,
    provider: 'google',
    lastAction: 'C-253 crisis quorum maintained — 9-of-10 sentinels active, consensus holding',
    domains: ['consensus', 'quorum', 'coordination'],
  },
];

// ── C-253 Civic Radar Alerts ─────────────────────────────────
// Major crisis cycle. Multiple high-severity alerts.

export const mockCivicAlerts: CivicRadarAlert[] = [
  {
    id: 'CRA-2055',
    title: 'Narrative feedback loop: Hormuz rumor → market spike → fear confirmation → more rumor',
    severity: 'critical',
    category: 'misinformation',
    source: 'AUREA Synthesis Engine',
    timestamp: '2026-03-17 10:50 ET',
    impact: 'Self-reinforcing belief system detected: unverified claims amplified by market reactions create false confirmation',
    actions: [
      'ZEUS maintaining continuous verification on yuan-passage claims',
      'HERMES throttling alarmist propagation across all channels',
      'JADE monitoring cognitive impact — numbness and inevitability patterns',
      'EVE ethics review on narrative manipulation vectors',
    ],
  },
  {
    id: 'CRA-2054',
    title: 'Deepfake audio targeting civic governance proceedings',
    severity: 'high',
    category: 'manipulation',
    source: 'ECHO Threat Intelligence',
    timestamp: '2026-03-17 10:40 ET',
    impact: 'Synthetic audio clips impersonating municipal officials detected in 2 forums during crisis chaos',
    actions: [
      'ZEUS opened verification lane for audio provenance',
      'EVE flagged for ethics review — democratic harm potential elevated during crisis',
      'ATLAS increased monitoring on governance channels',
    ],
  },
  {
    id: 'CRA-2053',
    title: 'Energy market shock — Brent $102, Gulf exports down 60%',
    severity: 'high',
    category: 'infrastructure',
    source: 'HERMES Market Router',
    timestamp: '2026-03-17 10:32 ET',
    impact: 'Hormuz disruption causing real energy supply shock — 20% of global oil/LNG transit affected',
    actions: [
      'ATLAS monitoring for systemic infrastructure contagion',
      'DAEDALUS reviewing UBI buffer adequacy under energy price stress',
      'HERMES prioritizing verified market data over narrative feeds',
    ],
  },
  {
    id: 'CRA-2052',
    title: 'Elevated civic anxiety — financial sentiment feeds showing fear amplification',
    severity: 'medium',
    category: 'manipulation',
    source: 'JADE Morale Assessment',
    timestamp: '2026-03-17 10:25 ET',
    impact: 'Citizen financial sentiment elevated by crisis — information overload → fear → belief anchoring → polarization',
    actions: [
      'JADE monitoring sentiment trajectory for inflection points',
      'EVE assessing ethical implications of fear amplification patterns',
      'AUREA preparing civic resilience synthesis',
    ],
  },
  {
    id: 'CRA-2051',
    title: 'Unverified yuan-only passage claim circulating at scale',
    severity: 'medium',
    category: 'misinformation',
    source: 'ZEUS Verification Engine',
    timestamp: '2026-03-17 10:20 ET',
    impact: 'Claim that Hormuz only accepts yuan for passage spreading without high-confidence sourcing',
    actions: [
      'ZEUS actively monitoring for official policy announcement from Iran',
      'HERMES throttling propagation of unverified claim',
      'ECHO tracking claim provenance across platforms',
    ],
  },
];
