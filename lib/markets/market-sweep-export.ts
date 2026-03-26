import { getMacroIntegrityPulse } from './macro-integrity';
import { getRatesDollarFusion } from './rates-dollar-fusion';

export type MarketSweepExportPayload = {
  timestamp: string;
  oneLineTakeaway: string;
  operatorBullets: string[];
  status: 'clear' | 'watch' | 'elevated' | 'risk-off';
};

const CACHE_TTL_MS = 60 * 1000;
let cached: { at: number; payload: MarketSweepExportPayload } | null = null;

function canonicalNow() {
  return new Date().toISOString();
}

export async function getMarketSweepExport(): Promise<MarketSweepExportPayload> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.payload;
  }

  const [fusion, integrity] = await Promise.all([
    getRatesDollarFusion(),
    getMacroIntegrityPulse(),
  ]);

  const status: MarketSweepExportPayload['status'] =
    fusion.marketSignal === 'risk-off'
      ? 'risk-off'
      : integrity.status === 'critical' || fusion.marketSignal === 'cautious'
        ? 'elevated'
        : integrity.status === 'degraded' || integrity.status === 'watch'
          ? 'watch'
          : 'clear';

  const oneLineTakeaway =
    status === 'risk-off'
      ? 'M1 is risk-off: fiscal and macro overlays are aligned in a defensive posture.'
      : status === 'elevated'
        ? 'M1 is elevated: macro conditions are pressuring posture and require tighter operator review.'
        : status === 'watch'
          ? 'M1 is on watch: trust and transmission surfaces are mixed but not in a full stress state.'
          : 'M1 is clear: fiscal-to-macro transmission is stable and trust surfaces are healthy.';

  const operatorBullets = [
    `Fusion signal: ${fusion.marketSignal} (${fusion.regime}).`,
    `Macro integrity: ${integrity.status} at ${(integrity.score * 100).toFixed(1)}%.`,
    `Active macro provider: ${integrity.activeProvider}.`,
    `Treasury cross-check posture: ${fusion.treasury.crossCheck}.`,
    ...fusion.takeaways.slice(0, 2),
  ];

  const payload: MarketSweepExportPayload = {
    timestamp: canonicalNow(),
    oneLineTakeaway,
    operatorBullets,
    status,
  };

  cached = { at: now, payload };
  return payload;
}
