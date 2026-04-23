import type { Metadata } from 'next';
import SignalsPageClient from './SignalsPageClient';

export const metadata: Metadata = {
  title: 'Signals · Mobius Terminal',
};

export default function SignalsPage() {
  return <SignalsPageClient />;
}
