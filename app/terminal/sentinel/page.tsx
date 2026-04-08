import type { Metadata } from 'next';
import SentinelPageClient from './SentinelPageClient';

export const metadata: Metadata = {
  title: 'Sentinel · Mobius Terminal',
};

export default function SentinelPage() {
  return <SentinelPageClient />;
}
