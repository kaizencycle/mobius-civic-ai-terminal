import type { Metadata } from 'next';
import LedgerPageClient from './LedgerPageClient';

export const metadata: Metadata = {
  title: 'Ledger · Mobius Terminal',
};

export default function LedgerPage() {
  return <LedgerPageClient />;
}
