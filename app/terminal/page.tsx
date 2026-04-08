import type { Metadata } from 'next';
import TerminalPageClient from './TerminalPageClient';
import { getTerminalBootstrapSnapshot } from '@/lib/terminal/bootstrap';

export const metadata: Metadata = {
  title: 'Terminal · Mobius Terminal',
};

export default async function TerminalPage() {
  const bootstrap = await getTerminalBootstrapSnapshot();
  return <TerminalPageClient bootstrap={bootstrap} />;
}
