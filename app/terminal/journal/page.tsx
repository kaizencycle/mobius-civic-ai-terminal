import type { Metadata } from 'next';
import JournalPageClient from './JournalPageClient';

export const metadata: Metadata = {
  title: 'Journal · Mobius Terminal',
};

export default function JournalPage() {
  return <JournalPageClient />;
}
