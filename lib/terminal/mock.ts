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

// ── C-255 Agent States (March 19, 2026 · close seal) ────────
// Iran war / Hormuz energy shock remains the dominant macro driver.

export const mockAgents: Agent[] = [
  {
    id: 'atlas',
    name: 'ATLAS',
    role: 'Sentinel / Monitoring',
    color: 'bg-sky-500',
    status: 'alert',
    heartbeatOk: true,
    lastAction: 'Tracking Hormuz transit-fee risk, bypass-route adaptation, and shipping-security escalation',
  },
  {
    id: 'zeus',
    name: 'ZEUS',
    role: 'Verification Engine',
    color: 'bg-amber-500',
    status: 'verifying',
    heartbeatOk: true,
    lastAction: 'Verifying Reuters war-energy pricing stack — Brent $108.65 settle, S&P 500 and Nasdaq both closed lower',
  },
  {
    id: 'hermes',
    name: 'HERMES',
    role: 'Routing / Signal Flow',
    color: 'bg-rose-500',
    status: 'routing',
    heartbeatOk: true,
    lastAction: 'Routing resilient-growth signals through the imported-energy inflation lane after ECB/BoE hold decisions',
  },
  {
    id: 'echo',
    name: 'ECHO',
    role: 'Memory / Ledger Intake',
    color: 'bg-slate-400',
    status: 'listening',
    heartbeatOk: true,
    lastAction: 'Recording C-255 close-out — market pulse, macro reroute, sentiment posture, and strategic adaptation sealed',
  },
  {
    id: 'aurea',
    name: 'AUREA',
    role: 'Architect / Strategy',
    color: 'bg-orange-500',
    status: 'analyzing',
    heartbeatOk: true,
    lastAction: 'Synthesizing the day as an energy-inflation-war close, not yet a full financial-break event',
  },
  {
    id: 'jade',
    name: 'JADE',
    role: 'Annotation / Morale',
    color: 'bg-emerald-500',
    status: 'analyzing',
    heartbeatOk: true,
    lastAction: 'Fear-heavy sentiment mapped as inflation anxiety rather than pure collapse psychology',
  },
  {
    id: 'eve',
    name: 'EVE',
    role: 'Observer / Ethics',
    color: 'bg-fuchsia-500',
    status: 'verifying',
    heartbeatOk: true,
    lastAction: 'Reviewing containment narratives to keep allied stabilization language distinct from panic amplification',
  },
  {
    id: 'daedalus',
    name: 'DAEDALUS',
    role: 'Builder / Research',
    color: 'bg-yellow-700',
    status: 'analyzing',
    heartbeatOk: true,
    lastAction: 'Refreshing terminal mock surfaces for C-255 with close-seal market, macro, and strategic snapshots',
  },
];

// ── C-255 EPICON Feed ───────────────────────────────────────
// One EPICON pulse per core agent for the March 19 close-out.

export const mockEpicon: EpiconItem[] = [
  {
    id: 'EPICON-C255-004',
    title: 'AUREA close seal: energy-inflation-war day, not yet a full financial-break day',
    category: 'governance',
    status: 'verified',
    confidenceTier: 4,
    ownerAgent: 'AUREA',
    timestamp: '2026-03-19 18:05 ET',
    sources: ['AUREA synthesis', 'Reuters macro wrap', 'Terminal close feed'],
    summary:
      'C-255 closes with the energy system as the center of gravity. Shipping, oil, gas, inflation expectations, and rate expectations all rerouted through the Iran war / Hormuz shock. Terminal snapshot at seal: SPY 659.8, QQQ 593.0, BTC 70,531, GLD 426.4.',
    trace: [
      'ECHO sealed the day\'s four core agent pulses into the close ledger',
      'HERMES routed growth resilience into an imported-energy inflation framework',
      'ZEUS confirmed the cleanest fear signal is inflation persistence, not immediate collapse',
      'ATLAS elevated strategic watchpoints around transit fees, bypass routes, and stockpiling',
      'AUREA classified the close as structured danger rather than systemic financial breakage',
    ],
  },
  {
    id: 'EPICON-C255-003',
    title: 'ATLAS: Hormuz is being repriced as a leverage weapon, not just a shipping lane',
    category: 'geopolitical',
    status: 'verified',
    confidenceTier: 3,
    ownerAgent: 'ATLAS',
    timestamp: '2026-03-19 17:42 ET',
    sources: ['Reuters shipping coverage', 'Gulf producer statements', 'Terminal strategy notes'],
    summary:
      'Iran considering transit fees and the effective blockade response have turned Hormuz back into a pricing weapon. Gulf producers are accelerating bypass routes, Qatar has halted LNG production, and importers are revisiting diversification and stockpiling assumptions.',
    trace: [
      'ATLAS flagged transit fees as the highest-consequence unresolved policy variable',
      'ECHO logged alternative pipeline and port adaptation as structural rather than temporary behavior',
      'HERMES routed shipping-security and reserve-release scenarios into the strategy lane',
      'ZEUS marked currency-reset narratives as over-amplified relative to the evidence',
      'AUREA converted the signal into a watchlist for the next cycle',
    ],
  },
  {
    id: 'EPICON-C255-002',
    title: 'HERMES: resilient global growth is being rerouted through the energy inflation channel',
    category: 'market',
    status: 'verified',
    confidenceTier: 3,
    ownerAgent: 'HERMES',
    timestamp: '2026-03-19 17:18 ET',
    sources: ['Reuters economies coverage', 'ECB decision', 'BoE decision'],
    summary:
      'Citi’s global surprise index stayed positive for 14 months, but the war is now the transmission channel. The Fed, ECB, and BoE held rates steady while warning that higher oil and gas prices could reverse inflation progress. BoE guidance now allows inflation to re-approach 3.5% if the shock persists.',
    trace: [
      'HERMES routed the surprise-index resilience signal into a downside energy filter',
      'ZEUS confirmed all three central-bank holds and their inflation concern language',
      'ATLAS tagged imported energy inflation as the current macro transmission mechanism',
      'JADE noted that policy anxiety is outrunning recession anxiety in operator sentiment',
      'AUREA shifted the macro frame from disinflation hope to inflation-risk reroute',
    ],
  },
  {
    id: 'EPICON-C255-001',
    title: 'ECHO: energy shock remains the cleanest truth asset in cross-market pricing',
    category: 'market',
    status: 'verified',
    confidenceTier: 3,
    ownerAgent: 'ECHO',
    timestamp: '2026-03-19 16:28 ET',
    sources: ['Reuters markets wrap', 'Terminal close feed'],
    summary:
      'Brent settled at $108.65 after touching $119.13, WTI settled at $96.14, and the Brent-WTI spread widened to an 11-year high. U.S. equities closed lower, the STOXX 600 fell 2.4%, and traders increasingly priced out Fed cuts before 2027. Inflation fear led the tape more cleanly than recession fear.',
    trace: [
      'ECHO ranked oil as the day\'s clearest direct-pricing signal because it reflects physical disruption',
      'ZEUS confirmed S&P 500 -0.27%, Nasdaq -0.28%, and STOXX 600 -2.4% from the close coverage',
      'HERMES routed the move as risk-off with inflation pressure rather than clean recession pricing',
      'JADE logged heightened fear, but still within institutional-response channels',
      'AUREA used the cross-asset stack as the close seal foundation',
    ],
  },
  {
    id: 'EPICON-C255-000',
    title: 'C-255 cycle seal — Reuters war-energy close synchronized into terminal memory',
    category: 'infrastructure',
    status: 'verified',
    confidenceTier: 4,
    ownerAgent: 'ECHO',
    timestamp: '2026-03-19 16:05 ET',
    sources: ['ECHO ledger system', 'Terminal operator seal'],
    summary:
      'Cycle C-255 close-out staged with one EPICON pulse per core agent: ECHO market pulse, HERMES macro routing, ZEUS sentiment read, ATLAS strategic posture, and AUREA synthesis.',
    trace: [
      'ECHO initialized the close-seal bundle for C-255',
      'ZENITH confirmed the core-agent pulse set was complete',
      'ATLAS verified no missing strategic watchpoints before seal',
      'AUREA approved the cycle summary language for terminal display',
    ],
  },
];

// ── C-255 Tripwires ─────────────────────────────────────────
// Energy shock remains live; inflation and shipping tripwires elevated.

export const mockTripwires: Tripwire[] = [
  {
    id: 'TW-130',
    label: 'Hormuz Transit Fee Risk',
    severity: 'high',
    owner: 'ATLAS',
    openedAt: '17:40 ET',
    action: 'Monitoring whether Iran formalizes transit fees and turns passage into an overt leverage instrument',
  },
  {
    id: 'TW-129',
    label: 'Energy Inflation Repricing',
    severity: 'high',
    owner: 'HERMES',
    openedAt: '16:28 ET',
    action: 'Oil shock is delaying expected rate cuts and reopening inflation risk across developed markets',
  },
  {
    id: 'TW-128',
    label: 'Narrative Overreach: System Reset Claims',
    severity: 'medium',
    owner: 'ZEUS',
    openedAt: '17:48 ET',
    action: 'Watching for over-amplified currency-reset narratives that move faster than the verified evidence',
  },
  {
    id: 'TW-127',
    label: 'Allied Stabilization Coordination',
    severity: 'medium',
    owner: 'EVE',
    openedAt: '17:05 ET',
    action: 'Joint diplomatic statements and energy-stabilization actions remain active; escalation risk persists if shipping deteriorates',
  },
];

// ── C-255 GI Snapshot ───────────────────────────────────────
// Growth is still resilient, but energy-driven inflation and shipping
// disorder pulled integrity lower again.

export const mockGI: GISnapshot = {
  score: 0.79,
  delta: -0.04,
  institutionalTrust: 0.81,
  infoReliability: 0.72,
  consensusStability: 0.75,
  weekly: [0.92, 0.9, 0.88, 0.85, 0.83, 0.81, 0.79],
};

// ── C-255 Ledger Entries ────────────────────────────────────

export const mockLedger: LedgerEntry[] = [
  {
    id: 'LE-C255-006',
    cycleId: 'C-255',
    type: 'epicon',
    agentOrigin: 'AUREA',
    timestamp: '2026-03-19 18:05 ET',
    summary: 'EPICON-C255-004 committed — AUREA close seal classifies the day as energy-inflation-war, not financial-break',
    integrityDelta: -0.01,
    status: 'committed',
  },
  {
    id: 'LE-C255-005',
    cycleId: 'C-255',
    type: 'epicon',
    agentOrigin: 'ATLAS',
    timestamp: '2026-03-19 17:42 ET',
    summary: 'EPICON-C255-003 committed — Hormuz transit fees and bypass-route adaptation elevated to strategic watch',
    integrityDelta: -0.02,
    status: 'committed',
  },
  {
    id: 'LE-C255-004',
    cycleId: 'C-255',
    type: 'epicon',
    agentOrigin: 'HERMES',
    timestamp: '2026-03-19 17:18 ET',
    summary: 'EPICON-C255-002 committed — resilient growth rerouted through imported-energy inflation risk',
    integrityDelta: -0.02,
    status: 'committed',
  },
  {
    id: 'LE-C255-003',
    cycleId: 'C-255',
    type: 'epicon',
    agentOrigin: 'ECHO',
    timestamp: '2026-03-19 16:28 ET',
    summary: 'EPICON-C255-001 committed — Brent $108.65, WTI $96.14, equities lower, inflation fear dominant',
    integrityDelta: -0.03,
    status: 'committed',
  },
  {
    id: 'LE-C255-002',
    cycleId: 'C-255',
    type: 'shard',
    agentOrigin: 'JADE',
    timestamp: '2026-03-19 16:40 ET',
    summary: 'MFS-7762 protection shard created — fear-heavy but rule-seeking public mood logged for the close',
    integrityDelta: 0.004,
    status: 'committed',
  },
  {
    id: 'LE-C255-001',
    cycleId: 'C-255',
    type: 'settlement',
    agentOrigin: 'ECHO',
    timestamp: '2026-03-19 16:05 ET',
    summary: 'C-255 close seal initialized — five core agent pulses staged for terminal memory',
    integrityDelta: 0,
    status: 'committed',
  },
  {
    id: 'LE-C254-011',
    cycleId: 'C-254',
    type: 'ubi',
    agentOrigin: 'DAEDALUS',
    timestamp: '2026-03-18 23:58 ET',
    summary: 'C-254 UBI distribution finalized — resilience buffers carried forward into the C-255 war-energy close',
    integrityDelta: 0,
    status: 'committed',
  },
];

// ── C-255 MFS Shards ────────────────────────────────────────

export const mockShards: MFSShard[] = [
  {
    id: 'MFS-7762',
    citizenId: 'CZ-1042',
    archetype: 'protection',
    weight: 0.91,
    qualityScore: 0.94,
    integrityCoefficient: 0.9,
    miiDelta: 0.016,
    timestamp: '2026-03-19 18:05 ET',
  },
  {
    id: 'MFS-7761',
    citizenId: 'CZ-0891',
    archetype: 'verification',
    weight: 0.96,
    qualityScore: 0.98,
    integrityCoefficient: 0.95,
    miiDelta: 0.021,
    timestamp: '2026-03-19 16:28 ET',
  },
  {
    id: 'MFS-7760',
    citizenId: 'CZ-1277',
    archetype: 'governance',
    weight: 0.87,
    qualityScore: 0.9,
    integrityCoefficient: 0.88,
    miiDelta: 0.013,
    timestamp: '2026-03-19 17:18 ET',
  },
];

// ── C-255 Attestations ──────────────────────────────────────

export const mockAttestations: Attestation[] = [
  {
    id: 'ATT-462',
    citizenId: 'CZ-1042',
    type: 'mint',
    reason: 'C-255 close synthesis contribution — structured-risk framing validated by AUREA',
    miiImpact: 0.028,
    validatorAgent: 'AUREA',
    timestamp: '2026-03-19 18:05 ET',
  },
  {
    id: 'ATT-461',
    citizenId: 'CZ-0891',
    type: 'mint',
    reason: 'Cross-market verification during war-energy repricing — Reuters close stack confirmed by ZEUS',
    miiImpact: 0.024,
    validatorAgent: 'ZEUS',
    timestamp: '2026-03-19 16:30 ET',
  },
  {
    id: 'ATT-460',
    citizenId: 'CZ-1277',
    type: 'mint',
    reason: 'Strategic watchpoint formalization — Hormuz leverage pathways mapped by ATLAS',
    miiImpact: 0.019,
    validatorAgent: 'ATLAS',
    timestamp: '2026-03-19 17:45 ET',
  },
];

// ── C-255 Sentinel Council ──────────────────────────────────

export const mockSentinels: Sentinel[] = [
  {
    id: 'sentinel-atlas',
    name: 'ATLAS',
    role: 'System Integrity Monitor',
    status: 'active',
    integrity: 0.95,
    provider: 'anthropic',
    lastAction: 'Strategic watchpoints set: transit fees, passage deals, panic-zone oil duration, and narrative overreach',
    domains: ['integrity', 'monitoring', 'escalation'],
  },
  {
    id: 'sentinel-zeus',
    name: 'ZEUS',
    role: 'Verification Arbiter',
    status: 'active',
    integrity: 0.97,
    provider: 'openai',
    lastAction: 'Verified close stack: Brent $108.65, WTI $96.14, S&P 500 -0.27%, Nasdaq -0.28%, STOXX 600 -2.4%',
    domains: ['verification', 'source-chain', 'confidence'],
  },
  {
    id: 'sentinel-eve',
    name: 'EVE',
    role: 'Ethics Observer',
    status: 'active',
    integrity: 0.98,
    provider: 'anthropic',
    lastAction: 'Monitoring diplomatic containment language to reduce panic while preserving operational clarity',
    domains: ['ethics', 'bias', 'governance'],
  },
  {
    id: 'sentinel-hermes',
    name: 'HERMES',
    role: 'Signal Router',
    status: 'active',
    integrity: 0.94,
    provider: 'google',
    lastAction: 'Rerouting macro interpretation from disinflation optimism toward imported-energy inflation risk',
    domains: ['routing', 'prioritization', 'throttling'],
  },
  {
    id: 'sentinel-echo',
    name: 'ECHO',
    role: 'Memory Keeper',
    status: 'active',
    integrity: 0.99,
    provider: 'anthropic',
    lastAction: 'C-255 close ledger active — five pulses committed, market snapshot sealed for terminal recall',
    domains: ['memory', 'archival', 'ledger'],
  },
  {
    id: 'sentinel-aurea',
    name: 'AUREA',
    role: 'Strategic Architect',
    status: 'active',
    integrity: 0.95,
    provider: 'openai',
    lastAction: 'Close verdict issued: more dangerous than a headline day, more structured than a collapse day',
    domains: ['strategy', 'synthesis', 'architecture'],
  },
  {
    id: 'sentinel-jade',
    name: 'JADE',
    role: 'Pattern Analyst',
    status: 'active',
    integrity: 0.93,
    provider: 'google',
    lastAction: 'Mapped public mood as anxious but still rule-seeking — inflation fear dominates collapse fear',
    domains: ['annotation', 'patterns', 'morale'],
  },
  {
    id: 'sentinel-daedalus',
    name: 'DAEDALUS',
    role: 'Builder / Researcher',
    status: 'active',
    integrity: 0.94,
    provider: 'meta',
    lastAction: 'Updated terminal mock state to reflect March 19 close seal and cross-market snapshot values',
    domains: ['research', 'building', 'ubi'],
  },
  {
    id: 'sentinel-uriel',
    name: 'URIEL',
    role: 'Safety Guardian',
    status: 'active',
    integrity: 0.99,
    provider: 'anthropic',
    lastAction: 'Safety posture elevated for shipping escalation and inflation-shock civic stress transmission',
    domains: ['safety', 'escalation', 'veto'],
  },
  {
    id: 'sentinel-zenith',
    name: 'ZENITH',
    role: 'Consensus Coordinator',
    status: 'consensus',
    integrity: 0.96,
    provider: 'google',
    lastAction: 'C-255 quorum maintained — core-agent pulse set complete and internally coherent at seal',
    domains: ['consensus', 'quorum', 'coordination'],
  },
];

// ── C-255 Civic Radar Alerts ────────────────────────────────

export const mockCivicAlerts: CivicRadarAlert[] = [
  {
    id: 'CRA-2064',
    title: 'Transit fee scenario emerging in Hormuz shipping lanes',
    severity: 'critical',
    category: 'infrastructure',
    source: 'ATLAS Strategic Monitor',
    timestamp: '2026-03-19 17:42 ET',
    impact: 'If formalized, transit fees would shift Hormuz from a chokepoint headline into an overt pricing and leverage regime for energy trade',
    actions: [
      'ATLAS tracking formal policy language and bilateral exceptions',
      'HERMES mapping implications for shipping costs, reserve releases, and rerouting',
      'ZEUS filtering out premature system-reset narratives until policy is explicit',
      'AUREA preparing scenario branches for the next cycle',
    ],
  },
  {
    id: 'CRA-2063',
    title: 'Oil shock reprices central-bank path across the U.S. and Europe',
    severity: 'high',
    category: 'infrastructure',
    source: 'HERMES Market Router',
    timestamp: '2026-03-19 16:28 ET',
    impact: 'Brent at $108.65 settlement and an 11-year-high Brent-WTI spread are pushing markets to postpone rate-cut expectations while growth remains only partially impaired',
    actions: [
      'ZEUS maintaining verification of close-market and rate-pricing data',
      'JADE monitoring inflation-fear amplification in public channels',
      'EVE tracking policy communication for panic-control integrity',
    ],
  },
  {
    id: 'CRA-2062',
    title: 'Allied energy-stabilization bloc hardens around Hormuz passage security',
    severity: 'high',
    category: 'governance',
    source: 'EVE Diplomatic Watch',
    timestamp: '2026-03-19 17:05 ET',
    impact: 'Britain, France, Germany, Italy, the Netherlands, and Japan have converged on a containment-and-stabilization posture rather than accepting blockade normalization',
    actions: [
      'EVE distinguishing stabilization efforts from escalation rhetoric',
      'ATLAS watching for shipping-security implementation moves',
      'AUREA incorporating allied coordination into the strategic baseline',
    ],
  },
  {
    id: 'CRA-2061',
    title: 'Inflation fear dominates public mood as equities slide and gold firms',
    severity: 'medium',
    category: 'manipulation',
    source: 'JADE Morale Assessment',
    timestamp: '2026-03-19 16:45 ET',
    impact: 'The dominant fear signal is persistent inflation and delayed relief, not immediate systemic collapse; this keeps institutional channels intact but stressed',
    actions: [
      'JADE tracking whether anxiety mutates into collapse narratives',
      'ZEUS checking sensational claims against the verified close stack',
      'HERMES keeping the operator view centered on energy transmission mechanics',
    ],
  },
];
