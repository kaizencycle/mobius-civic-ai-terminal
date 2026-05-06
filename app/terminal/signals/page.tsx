import { chamberMeta } from '../layout';
import SignalsPageClient from './SignalsPageClient';

export const metadata = chamberMeta(
  'Signals',
  'Micro-instrument signal sweep across 8 agents — composite GI signal health and anomaly tracking.',
  'signals'
);

export default function SignalsPage() {
  return <SignalsPageClient />;
}
