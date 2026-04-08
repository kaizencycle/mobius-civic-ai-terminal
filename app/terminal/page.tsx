import type { Metadata } from 'next';
import GlobePageClient from './GlobePageClient';

export const metadata: Metadata = {
  title: 'Globe · Mobius Terminal',
};

export default function TerminalPage() {
  return <GlobePageClient />;
}
