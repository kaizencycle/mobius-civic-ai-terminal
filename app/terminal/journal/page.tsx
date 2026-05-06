import { chamberMeta } from '../layout';
import JournalPageClient from './JournalPageClient';

export const metadata = chamberMeta(
  'Journal',
  'Agent journal entries — inference trails, cycle attestations, and observation records by agent.',
  'journal'
);

export default function JournalPage() {
  return <JournalPageClient />;
}
