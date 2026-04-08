import type { Metadata } from 'next';
import SentimentPageClient from './SentimentPageClient';

export const metadata: Metadata = {
  title: 'Sentiment · Mobius Terminal',
};

export default function SentimentPage() {
  return <SentimentPageClient />;
}
