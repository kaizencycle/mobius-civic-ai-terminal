import type { IntegrityStatusResponse } from '@/lib/mock/integrityStatus';
import type { PromotionStatus } from '@/lib/terminal/api';
import type { Agent, EpiconItem, LedgerEntry, Tripwire } from '@/lib/terminal/types';

export type TerminalBootstrapSnapshot = {
  agents: Agent[];
  epicon: EpiconItem[];
  feedLedgerRows: LedgerEntry[];
  integrityStatus: IntegrityStatusResponse;
  tripwires: Tripwire[];
  promotion: PromotionStatus | null;
};
