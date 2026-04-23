import type { Metadata } from 'next';
import MicPageClient from './MicPageClient';

export const metadata: Metadata = {
  title: 'MIC · Mobius Terminal',
};

export default function MicPage() {
  return <MicPageClient />;
}
