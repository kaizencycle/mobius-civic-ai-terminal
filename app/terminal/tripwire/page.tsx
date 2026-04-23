import type { Metadata } from 'next';
import TripwirePageClient from './TripwirePageClient';

export const metadata: Metadata = {
  title: 'Tripwire · Mobius Terminal',
};

export default function TripwirePage() {
  return <TripwirePageClient />;
}
