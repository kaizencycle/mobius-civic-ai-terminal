import { getMarketSweepExport } from '@/lib/markets/market-sweep-export';

export type NarratorAgent = 'aurea' | 'hermes';

export type MarketNarrationPayload = {
  timestamp: string;
  agent: NarratorAgent;
  title: string;
  shortSummary: string;
  spokenSummary: string;
  postSummary: string;
  bullets: string[];
};

const CACHE_TTL_MS = 60 * 1000;

let cached: Record<NarratorAgent, { at: number; payload: MarketNarrationPayload } | null> = {
  aurea: null,
  hermes: null,
};

function canonicalNow() {
  return new Date().toISOString();
}

function aureaVoice(oneLine: string, bullets: string[]) {
  return {
    title: 'AUREA — Strategic Market Narration',
    shortSummary: oneLine,
    spokenSummary: [
      'AUREA market narration online.',
      oneLine,
      bullets[0] ?? '',
      bullets[1] ?? '',
      bullets[2] ?? '',
    ]
      .filter(Boolean)
      .join(' '),
    postSummary: [
      'AUREA // M1',
      oneLine,
      '',
      ...bullets.map((b) => `- ${b}`),
    ].join('\n'),
  };
}

function hermesVoice(oneLine: string, bullets: string[]) {
  return {
    title: 'HERMES — Economic Intelligence Brief',
    shortSummary: oneLine,
    spokenSummary: [
      'HERMES brief.',
      oneLine,
      'Key drivers:',
      ...bullets.slice(0, 3),
    ].join(' '),
    postSummary: [
      'HERMES // M1',
      oneLine,
      '',
      ...bullets.map((b) => `• ${b}`),
    ].join('\n'),
  };
}

export async function getMarketNarration(agent: NarratorAgent): Promise<MarketNarrationPayload> {
  const now = Date.now();
  const existing = cached[agent];
  if (existing && now - existing.at < CACHE_TTL_MS) {
    return existing.payload;
  }

  const exportBlock = await getMarketSweepExport();

  const baseBullets = exportBlock.operatorBullets.slice(0, 5);
  const voice =
    agent === 'hermes'
      ? hermesVoice(exportBlock.oneLineTakeaway, baseBullets)
      : aureaVoice(exportBlock.oneLineTakeaway, baseBullets);

  const payload: MarketNarrationPayload = {
    timestamp: canonicalNow(),
    agent,
    title: voice.title,
    shortSummary: voice.shortSummary,
    spokenSummary: voice.spokenSummary,
    postSummary: voice.postSummary,
    bullets: baseBullets,
  };

  cached[agent] = { at: now, payload };
  return payload;
}
