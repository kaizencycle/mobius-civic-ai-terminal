import { chamberMeta } from '../layout';
import PulsePageClient from './PulsePageClient';

export const revalidate = 60;

export const metadata = chamberMeta(
  'Pulse',
  'Live EPICON event feed and agent attestation stream — Mobius civic intelligence pulse.',
  'pulse'
);

export default function PulsePage() {
  return <PulsePageClient />;
}
