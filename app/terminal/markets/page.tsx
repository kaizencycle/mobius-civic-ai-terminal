import { chamberMeta } from '../layout';
import MarketsChamber from '@/components/terminal/chambers/MarketsChamber';

export const metadata = chamberMeta(
  'Markets',
  'Real-time market signals — integrity-weighted equity, crypto, governance, and macro indicators.',
  'markets'
);

export default function MarketsPage() {
  return (
    <div className="h-full flex flex-col">
      <MarketsChamber />
    </div>
  );
}
