import { chamberMeta } from '../layout';
import GlobePageClient from '../GlobePageClient';

export const metadata = chamberMeta(
  'Globe',
  'Live 3D globe showing seismic EPICON events, sentiment domains, and civic signal pins by geography.',
  'globe'
);

export default function GlobePage() {
  return <GlobePageClient />;
}
