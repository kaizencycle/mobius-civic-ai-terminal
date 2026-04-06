import TerminalPageClient from './TerminalPageClient';
import { getTerminalBootstrapSnapshot } from '@/lib/terminal/bootstrap';

export const dynamic = 'force-dynamic';

export default async function TerminalPage() {
  const bootstrap = await getTerminalBootstrapSnapshot();
  return <TerminalPageClient bootstrap={bootstrap} />;
}
