import type { Metadata } from 'next';
import PulsePageClient from './PulsePageClient';

export const metadata: Metadata = {
  title: 'Pulse · Mobius Terminal',
};

export default function PulsePage() {
  return <PulsePageClient />;
}
