import { chamberMeta } from '../layout';
import LedgerPageClient from './LedgerPageClient';

export const metadata = chamberMeta(
  'Ledger',
  'EPICON event ledger — MII-rated civic events with verdict tracking, integrity delta, and source provenance.',
  'ledger'
);

export default function LedgerPage() {
  return <LedgerPageClient />;
}
