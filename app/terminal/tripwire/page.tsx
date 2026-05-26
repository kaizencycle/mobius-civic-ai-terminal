import type { Metadata } from 'next';
import TripwireChamber from '@/components/terminal/chambers/TripwireChamber';

export const metadata: Metadata = {
  title: 'Tripwire · Mobius Terminal',
};

export default function TripwirePage() {
  return (
    <div className="h-full flex flex-col">
      <TripwireChamber />
    </div>
  );
}
